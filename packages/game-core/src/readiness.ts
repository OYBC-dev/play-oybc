import { TASKS_PER_BOARD } from './constants';
import { PoolTask, Seat } from './types';
import { canBeDealt } from './visibility';

/**
 * Launch readiness: for each seat with fewer than 24 dealable tasks, how many more it needs.
 *
 * @returns Map of seatId to shortfall; seats that are ready are omitted.
 */
export function shortfalls(tasks: readonly PoolTask[], seats: readonly Seat[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const seat of seats) {
    const eligible = tasks.filter((t) => canBeDealt(t, seat.seatId)).length;
    if (eligible < TASKS_PER_BOARD) out[seat.seatId] = TASKS_PER_BOARD - eligible;
  }
  return out;
}
