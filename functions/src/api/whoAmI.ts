import { onCall } from 'firebase-functions/v2/https';
import type { MemberDoc, WhoAmIReq, WhoAmIRes } from 'game-core';
import { requireUid } from '../lib/auth';
import { appError } from '../lib/errors';
import { codeRef, db, refs } from '../lib/gameRefs';

/** Resolves a code to the caller's seat (any stage), or null when the caller is not a member. */
export const whoAmI = onCall<WhoAmIReq, Promise<WhoAmIRes>>(async (req) => {
  const uid = requireUid(req);
  const code = String(req.data?.code ?? '').trim().toUpperCase();
  const codeSnap = await codeRef(code).get();
  if (!codeSnap.exists) throw appError('not-found', 'game-not-found');
  const gameId = (codeSnap.data() as { gameId: string }).gameId;
  const [gameSnap, memberSnap] = await db.getAll(refs(gameId).game, refs(gameId).member(uid));
  if (!gameSnap.exists) throw appError('not-found', 'game-not-found');
  if (!memberSnap.exists) return null;
  return { gameId, seatId: (memberSnap.data() as MemberDoc).seatId };
});
