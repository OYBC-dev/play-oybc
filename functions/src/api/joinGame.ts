import { onCall } from 'firebase-functions/v2/https';
import {
  CENTER_INDEX, dealBoard, nameKey, normalizeName,
  type BoardDoc, type GameDoc, type JoinGameReq, type JoinGameRes, type MemberDoc, type ReclaimDoc,
} from 'game-core';
import { requireUid } from '../lib/auth';
import { appError } from '../lib/errors';
import { codeRef, db, parseCode, refs } from '../lib/gameRefs';
import { rebuildViews, toSeats, toTasks } from '../lib/views';

/** Joins a game by code: resumes an existing member, requests reclaim on a name clash, else seats the caller (dealing a board if playing). */
export const joinGame = onCall<JoinGameReq, Promise<JoinGameRes>>(async (req) => {
  const uid = requireUid(req);
  const code = parseCode(req.data?.code);
  const name = normalizeName(String(req.data?.name ?? ''));

  return db.runTransaction(async (tx): Promise<JoinGameRes> => {
    const codeSnap = await tx.get(codeRef(code));
    if (!codeSnap.exists) throw appError('not-found', 'game-not-found');
    const gameId = (codeSnap.data() as { gameId: string }).gameId;
    const r = refs(gameId);
    const [gameSnap, memberSnap, seatsSnap, tasksSnap, pendingSnap] = await Promise.all([
      tx.get(r.game), tx.get(r.member(uid)), tx.get(r.seats), tx.get(r.tasks),
      tx.get(r.reclaims.where('requesterUid', '==', uid).where('status', '==', 'pending')),
    ]);
    if (!gameSnap.exists) throw appError('not-found', 'game-not-found');
    const game = gameSnap.data() as GameDoc;
    if (memberSnap.exists) {
      return { status: 'resumed', gameId, seatId: (memberSnap.data() as MemberDoc).seatId };
    }
    if (game.stage === 'ended') throw appError('failed-precondition', 'game-ended');
    if (!name) throw appError('invalid-argument', 'invalid-name');

    const key = nameKey(name);
    const taken = seatsSnap.docs.find((d) => (d.data() as { nameKey: string }).nameKey === key);
    if (taken) {
      const existing = pendingSnap.docs.find((d) => (d.data() as ReclaimDoc).seatId === taken.id);
      if (existing) return { status: 'reclaim-pending', gameId, reclaimId: existing.id };
      const reclaimRef = r.reclaims.doc();
      const reclaim: ReclaimDoc = {
        requesterUid: uid, name, seatId: taken.id, status: 'pending', createdAt: Date.now(),
      };
      tx.set(reclaimRef, reclaim);
      return { status: 'reclaim-pending', gameId, reclaimId: reclaimRef.id };
    }

    const seatId = r.seats.doc().id;
    const now = Date.now();
    const seats = [...toSeats(seatsSnap.docs), { seatId, name, joinedAt: now }];
    const tasks = toTasks(tasksSnap.docs);
    if (game.stage === 'playing') {
      let cells;
      try {
        cells = dealBoard(tasks, seats, seatId);
      } catch {
        throw appError('failed-precondition', 'not-ready');
      }
      const marks = Array<boolean>(25).fill(false);
      marks[CENTER_INDEX] = true;
      const board: BoardDoc = { cells, marks, completedLines: [], announcedLines: [] };
      tx.set(r.board(seatId), board);
    }
    tx.set(r.seat(seatId), { name, nameKey: key, joinedAt: now });
    tx.set(r.member(uid), { seatId });
    rebuildViews(tx, gameId, tasks, seats);
    return { status: 'joined', gameId, seatId };
  });
});
