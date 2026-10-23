import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { DeleteTaskReq, TaskDoc } from 'game-core';
import { requireMember, requireUid } from '../lib/auth';
import { appError } from '../lib/errors';
import { db, parseGameId, refs } from '../lib/gameRefs';
import { rebuildViews, toSeats, toTasks } from '../lib/views';
import { TX_OPTIONS } from '../lib/tx';

/** Deletes a pool task in the lobby (author or host) and rebuilds every seat's view. */
export const deleteTask = onCall<DeleteTaskReq, Promise<Record<string, never>>>(async (req) => {
  const uid = requireUid(req);
  const gameId = parseGameId(req.data?.gameId);
  const taskId = req.data?.taskId;
  if (typeof taskId !== 'string' || !taskId || taskId.includes('/')) throw new HttpsError('not-found', 'Task not found');

  return db.runTransaction(async (tx) => {
    const r = refs(gameId);
    const [{ seatId, game }, seatsSnap, tasksSnap] = await Promise.all([
      requireMember(tx, gameId, uid), tx.get(r.seats), tx.get(r.tasks),
    ]);
    if (game.stage !== 'lobby') throw appError('failed-precondition', 'wrong-stage');
    const target = tasksSnap.docs.find((d) => d.id === taskId);
    if (!target) throw new HttpsError('not-found', 'Task not found');
    if ((target.data() as TaskDoc).authorSeatId !== seatId && game.hostSeatId !== seatId) {
      throw new HttpsError('permission-denied', 'Only the author or host can delete this task');
    }
    tx.delete(target.ref);
    rebuildViews(tx, gameId, toTasks(tasksSnap.docs.filter((d) => d.id !== taskId)), toSeats(seatsSnap.docs));
    return {};
  }, TX_OPTIONS);
});
