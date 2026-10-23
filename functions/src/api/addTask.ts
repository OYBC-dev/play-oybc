import { onCall } from 'firebase-functions/v2/https';
import { MAX_TASK_LENGTH, parseMentions, type AddTaskReq, type TaskDoc } from 'game-core';
import { requireMember, requireUid } from '../lib/auth';
import { appError } from '../lib/errors';
import { db, parseGameId, refs } from '../lib/gameRefs';
import { rebuildViews, toSeats, toTasks } from '../lib/views';

/** Game-wide transactions conflict under concurrency (every add writes the game doc); allow many retries. */
export const TX_OPTIONS = { maxAttempts: 25 };

/** Adds a pool task in the lobby: parses @mentions, rejects self-mentions, rebuilds every seat's view. */
export const addTask = onCall<AddTaskReq, Promise<{ taskId: string }>>(async (req) => {
  const uid = requireUid(req);
  const gameId = parseGameId(req.data?.gameId);
  const text = String(req.data?.text ?? '').trim();
  if (!text || text.length > MAX_TASK_LENGTH) throw appError('invalid-argument', 'invalid-text');

  return db.runTransaction(async (tx) => {
    const r = refs(gameId);
    const [{ seatId, game }, seatsSnap, tasksSnap] = await Promise.all([
      requireMember(tx, gameId, uid), tx.get(r.seats), tx.get(r.tasks),
    ]);
    if (game.stage !== 'lobby') throw appError('failed-precondition', 'wrong-stage');
    const seats = toSeats(seatsSnap.docs);
    const parsed = parseMentions(text, seats);
    if (!parsed.ok) throw appError('invalid-argument', 'unknown-mention');
    if (parsed.mentions.seatIds.includes(seatId)) throw appError('invalid-argument', 'self-mention');

    const taskRef = r.tasks.doc();
    const doc: TaskDoc = { text, authorSeatId: seatId, mentions: parsed.mentions, createdAt: Date.now() };
    tx.set(taskRef, doc);
    rebuildViews(tx, gameId, [...toTasks(tasksSnap.docs), { id: taskRef.id, ...doc }], seats);
    return { taskId: taskRef.id };
  }, TX_OPTIONS);
});
