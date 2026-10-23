import { onCall } from 'firebase-functions/v2/https';
import type { TransferHostReq } from 'game-core';
import { requireMember, requireUid } from '../lib/auth';
import { appError } from '../lib/errors';
import { db, parseGameId, refs } from '../lib/gameRefs';
import { TX_OPTIONS } from '../lib/tx';

/**
 * Host-only: hands the host role to another seat.
 * @throws not-host, unknown-seat (malformed or nonexistent seat id).
 */
export const transferHost = onCall<TransferHostReq, Promise<Record<string, never>>>(async (req) => {
  const uid = requireUid(req);
  const gameId = parseGameId(req.data?.gameId);
  const toSeatId = req.data?.toSeatId;
  if (typeof toSeatId !== 'string' || !toSeatId || toSeatId.includes('/')) throw appError('not-found', 'unknown-seat');

  return db.runTransaction(async (tx) => {
    const r = refs(gameId);
    const { seatId, game } = await requireMember(tx, gameId, uid);
    if (seatId !== game.hostSeatId) throw appError('permission-denied', 'not-host');
    const target = await tx.get(r.seat(toSeatId));
    if (!target.exists) throw appError('not-found', 'unknown-seat');
    tx.update(r.game, { hostSeatId: toSeatId });
    return {};
  }, TX_OPTIONS);
});
