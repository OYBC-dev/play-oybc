import type { Transaction } from 'firebase-admin/firestore';
import { buildPoolView, shortfalls, type PoolTask, type Seat, type SeatDoc, type TaskDoc } from 'game-core';
import { refs } from './gameRefs';

/** Maps seat docs (id from doc id) into game-core Seats. */
export function toSeats(docs: { id: string; data(): unknown }[]): Seat[] {
  return docs.map((d) => {
    const s = d.data() as SeatDoc;
    return { seatId: d.id, name: s.name, joinedAt: s.joinedAt };
  });
}

/** Maps task docs (id from doc id) into game-core PoolTasks. */
export function toTasks(docs: { id: string; data(): unknown }[]): PoolTask[] {
  return docs.map((d) => {
    const t = d.data() as TaskDoc;
    return { id: d.id, text: t.text, authorSeatId: t.authorSeatId, mentions: t.mentions, createdAt: t.createdAt };
  });
}

/**
 * Writes every `views/{seatId}` and `games/{g}.shortfalls`. Callers must have read
 * `tasks` and `seats` earlier in the same transaction (reads precede writes).
 */
export function rebuildViews(tx: Transaction, gameId: string, tasks: readonly PoolTask[], seats: readonly Seat[]): void {
  const r = refs(gameId);
  const now = Date.now();
  for (const seat of seats) {
    tx.set(r.view(seat.seatId), { entries: buildPoolView(tasks, seats, seat.seatId), updatedAt: now });
  }
  tx.update(r.game, { shortfalls: shortfalls(tasks, seats) });
}
