import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { generateGameCode, normalizeName, nameKey, type CreateGameReq, type CreateGameRes, type GameDoc } from 'game-core';
import { requireUid } from '../lib/auth';
import { appError } from '../lib/errors';
import { codeRef, db, refs } from '../lib/gameRefs';
import { rebuildViews } from '../lib/views';

/** Creates a game in the lobby with the caller as host; retries code generation on collision. */
export const createGame = onCall<CreateGameReq, Promise<CreateGameRes>>(async (req) => {
  const uid = requireUid(req);
  const name = normalizeName(String(req.data?.name ?? ''));
  if (!name) throw appError('invalid-argument', 'invalid-name');

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateGameCode();
    const res = await db.runTransaction(async (tx): Promise<CreateGameRes | null> => {
      const cRef = codeRef(code);
      if ((await tx.get(cRef)).exists) return null;
      const gameRef = db.collection('games').doc();
      const gameId = gameRef.id;
      const r = refs(gameId);
      const seatId = r.seats.doc().id;
      const now = Date.now();
      const game: GameDoc = {
        code, stage: 'lobby', hostSeatId: seatId, createdAt: now, bingoCount: 0, shortfalls: {}, reviewGate: false,
      };
      tx.set(cRef, { gameId });
      tx.set(gameRef, game);
      tx.set(r.seat(seatId), { name, nameKey: nameKey(name), joinedAt: now });
      tx.set(r.member(uid), { seatId });
      rebuildViews(tx, gameId, [], [{ seatId, name, joinedAt: now }]);
      return { gameId, code, seatId };
    });
    if (res) return res;
  }
  throw new HttpsError('resource-exhausted', 'Could not allocate a game code');
});
