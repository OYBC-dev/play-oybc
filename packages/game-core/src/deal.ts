import { CenterSquareType, GRID_SIZE, TASKS_PER_BOARD } from './constants';
import { resolveMentionDisplay } from './mentions';
import { placeBoard } from './placement';
import { PoolTask, Seat } from './types';
import { canBeDealt } from './visibility';

/** One square of a dealt board. */
export type BoardCell = { kind: 'task'; taskId: string; text: string } | { kind: 'free' };

/**
 * Deals a 5x5 board for one seat: shuffles the dealable tasks, centers FREE,
 * and resolves mentions for display (see {@link resolveMentionDisplay}): each
 * `@someone` becomes one other seat (consistent within a task), `@Name` the
 * seat's name, `@anyone` "Anyone".
 *
 * @throws Error('insufficient-pool') when fewer than 24 tasks are dealable to the seat.
 */
export function dealBoard(
  tasks: readonly PoolTask[],
  seats: readonly Seat[],
  seatId: string,
  rng: () => number = Math.random,
): BoardCell[] {
  const eligible = tasks.filter((t) => canBeDealt(t, seatId));
  if (eligible.length < TASKS_PER_BOARD) throw new Error('insufficient-pool');
  const others = seats.filter((s) => s.seatId !== seatId);
  const grid = placeBoard({ items: eligible, gridSize: GRID_SIZE, centerType: CenterSquareType.FREE, randomize: true, rng });
  return grid.map((task): BoardCell => {
    if (!task) return { kind: 'free' };
    const someoneName = others.length ? others[Math.floor(rng() * others.length)].name : null;
    const text = resolveMentionDisplay(task.text, seats, someoneName);
    return { kind: 'task', taskId: task.id, text };
  });
}
