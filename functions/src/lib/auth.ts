import type { CallableRequest } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import type { Transaction } from 'firebase-admin/firestore';
import type { GameDoc, MemberDoc } from 'game-core';
import { appError } from './errors';
import { refs } from './gameRefs';

/** Returns the caller's uid or throws `unauthenticated`. */
export function requireUid(req: CallableRequest<unknown>): string {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required');
  return req.auth.uid;
}

/**
 * Loads the game and the caller's seat inside a transaction.
 * @throws game-not-found (not-found) when the game is missing; permission-denied when uid is not a member.
 */
export async function requireMember(
  tx: Transaction,
  gameId: string,
  uid: string,
): Promise<{ seatId: string; game: GameDoc }> {
  const r = refs(gameId);
  const [gameSnap, memberSnap] = await Promise.all([tx.get(r.game), tx.get(r.member(uid))]);
  if (!gameSnap.exists) throw appError('not-found', 'game-not-found');
  if (!memberSnap.exists) throw new HttpsError('permission-denied', 'Not a member of this game');
  return { seatId: (memberSnap.data() as MemberDoc).seatId, game: gameSnap.data() as GameDoc };
}
