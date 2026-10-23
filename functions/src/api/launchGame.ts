import { onCall } from 'firebase-functions/v2/https';
import { CENTER_INDEX, dealBoard, shortfalls, type BoardDoc, type LaunchGameReq } from 'game-core';
import { requireMember, requireUid } from '../lib/auth';
import { appError } from '../lib/errors';
import { db, parseGameId, refs } from '../lib/gameRefs';
import { TX_OPTIONS } from '../lib/tx';
import { toSeats, toTasks } from '../lib/views';

/** Host-only: recomputes readiness, deals every seat a board and moves the game to `playing`. */
export const launchGame = onCall<LaunchGameReq, Promise<Record<string, never>>>(async (req) => {
  const uid = requireUid(req);
  const gameId = parseGameId(req.data?.gameId);

  return db.runTransaction(async (tx) => {
    const r = refs(gameId);
    const [{ seatId, game }, seatsSnap, tasksSnap] = await Promise.all([
      requireMember(tx, gameId, uid), tx.get(r.seats), tx.get(r.tasks),
    ]);
    if (seatId !== game.hostSeatId) throw appError('permission-denied', 'not-host');
    if (game.stage !== 'lobby') throw appError('failed-precondition', 'wrong-stage');
    const seats = toSeats(seatsSnap.docs);
    const tasks = toTasks(tasksSnap.docs);
    const short = shortfalls(tasks, seats);
    if (Object.keys(short).length > 0) {
      throw appError('failed-precondition', 'not-ready', undefined, { shortfalls: short });
    }
    for (const seat of seats) {
      const marks = Array<boolean>(25).fill(false);
      marks[CENTER_INDEX] = true;
      const board: BoardDoc = { cells: dealBoard(tasks, seats, seat.seatId), marks, completedLines: [], announcedLines: [] };
      tx.set(r.board(seat.seatId), board);
    }
    tx.update(r.game, { stage: 'playing', launchedAt: Date.now(), shortfalls: {} });
    return {};
  }, TX_OPTIONS);
});
