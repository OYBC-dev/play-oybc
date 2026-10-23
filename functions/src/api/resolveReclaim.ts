import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { MemberDoc, ReclaimDoc, ResolveReclaimReq } from 'game-core';
import { requireMember, requireUid } from '../lib/auth';
import { appError } from '../lib/errors';
import { db, parseGameId, refs } from '../lib/gameRefs';
import { TX_OPTIONS } from '../lib/tx';

/**
 * Host-only: approves or denies a pending seat reclaim. Approval re-points the seat's member mapping at the
 * requester's uid (deleting the seat's previous member doc); works in any stage.
 * @throws not-host, not-found (missing reclaim), invalid-argument (bad `approve`), wrong-stage (already resolved, or requester already seated).
 */
export const resolveReclaim = onCall<ResolveReclaimReq, Promise<Record<string, never>>>(async (req) => {
  const uid = requireUid(req);
  const gameId = parseGameId(req.data?.gameId);
  const { reclaimId, approve } = req.data ?? ({} as Partial<ResolveReclaimReq>);
  if (typeof reclaimId !== 'string' || !reclaimId || reclaimId.includes('/')) throw appError('not-found', 'reclaim-not-found');
  if (typeof approve !== 'boolean') throw new HttpsError('invalid-argument', 'approve must be a boolean');

  const outcome = await db.runTransaction(async (tx): Promise<'done' | 'conflict'> => {
    const r = refs(gameId);
    const { seatId, game } = await requireMember(tx, gameId, uid);
    if (seatId !== game.hostSeatId) throw appError('permission-denied', 'not-host');
    const reclaimSnap = await tx.get(r.reclaim(reclaimId));
    if (!reclaimSnap.exists) throw appError('not-found', 'reclaim-not-found');
    const reclaim = reclaimSnap.data() as ReclaimDoc;
    if (reclaim.status !== 'pending') throw appError('failed-precondition', 'wrong-stage');
    if (!approve) {
      tx.update(reclaimSnap.ref, { status: 'denied' });
      return 'done';
    }
    const [requesterSnap, holdersSnap, pendingSnap] = await Promise.all([
      tx.get(r.member(reclaim.requesterUid)),
      tx.get(r.members.where('seatId', '==', reclaim.seatId)),
      tx.get(r.reclaims.where('seatId', '==', reclaim.seatId).where('status', '==', 'pending')),
    ]);
    if (requesterSnap.exists || seatId === reclaim.seatId) {
      tx.update(reclaimSnap.ref, { status: 'denied' });
      // Requester already seated, or the host's own seat: commit the denial, then report outside the tx: throwing here would roll it back.
      return 'conflict';
    }
    for (const d of holdersSnap.docs) tx.delete(d.ref);
    tx.set(r.member(reclaim.requesterUid), { seatId: reclaim.seatId } satisfies MemberDoc);
    tx.update(reclaimSnap.ref, { status: 'approved' });
    for (const d of pendingSnap.docs) if (d.id !== reclaimId) tx.update(d.ref, { status: 'denied' });
    return 'done';
  }, TX_OPTIONS);
  if (outcome === 'conflict') throw appError('failed-precondition', 'wrong-stage');
  return {};
});
