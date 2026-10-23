import { onCall } from 'firebase-functions/v2/https';
import type { EndGameReq } from 'game-core';
import { requireMember, requireUid } from '../lib/auth';
import { appError } from '../lib/errors';
import { db, parseGameId, refs } from '../lib/gameRefs';
import { TX_OPTIONS } from '../lib/tx';

/** Host-only: ends a playing game (marks are rejected afterwards). */
export const endGame = onCall<EndGameReq, Promise<Record<string, never>>>(async (req) => {
  const uid = requireUid(req);
  const gameId = parseGameId(req.data?.gameId);

  return db.runTransaction(async (tx) => {
    const { seatId, game } = await requireMember(tx, gameId, uid);
    if (seatId !== game.hostSeatId) throw appError('permission-denied', 'not-host');
    if (game.stage !== 'playing') throw appError('failed-precondition', 'wrong-stage');
    tx.update(refs(gameId).game, { stage: 'ended', endedAt: Date.now() });
    return {};
  }, TX_OPTIONS);
});
