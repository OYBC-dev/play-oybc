import { GRID_SIZE, centerTypeFor } from './constants';
import { resolveMentionRefs } from './mentions';
import { fillableCellCount, placeBoard } from './placement';
import { fisherYatesShuffle } from './shuffle';
import { PoolTask, Seat } from './types';
import { canBeDealt } from './visibility';

/**
 * One square of a dealt board. A task cell's `refs` are the `[start, end)`
 * offsets of resolved mentions in `text` (absent = plain task).
 */
export type BoardCell =
  | { kind: 'task'; taskId: string; text: string; refs?: Array<[number, number]> }
  | { kind: 'free' };

/** Game options that shape a deal. */
export interface DealOptions {
  /** FREE center when true (24 tasks per board), ordinary center when false (25). */
  freeSpace: boolean;
  /** `@anyone` task id → the one seat it may be dealt to; tasks not in the map go to everyone. */
  anyoneAssignment?: Readonly<Record<string, string>>;
  /** Tasks already dealt to some board (late join): never dealt again. */
  excludeTaskIds?: ReadonlySet<string>;
}

/** Legacy deal options: FREE center, no assignment, no exclusions. */
const LEGACY_DEAL: DealOptions = { freeSpace: true };

/**
 * Tasks one board needs.
 *
 * @param freeSpace whether the center is FREE
 * @returns 24 with free space, 25 without.
 */
export function tasksPerBoard(freeSpace: boolean): number {
  return fillableCellCount(GRID_SIZE, centerTypeFor(freeSpace));
}

/** Whether `task` may go on `seatId`'s board under `opts`. */
function isEligible(task: PoolTask, seatId: string, opts: DealOptions): boolean {
  if (!canBeDealt(task, seatId)) return false;
  if (opts.excludeTaskIds?.has(task.id)) return false;
  const assigned = task.mentions.anyone ? opts.anyoneAssignment?.[task.id] : undefined;
  return assigned === undefined || assigned === seatId;
}

/**
 * Deals a 5x5 board for one seat: shuffles the eligible tasks, centers FREE
 * when `opts.freeSpace`, and resolves mentions for display (see
 * {@link resolveMentionRefs}): each `@someone` becomes one other seat
 * (consistent within a task), `@Name` the seat's name, `@anyone` "Anyone".
 * Task cells carry `refs` when the text has a resolved mention.
 *
 * @param opts defaults to the legacy deal (FREE center, no assignment, no exclusions)
 * @throws Error('insufficient-pool') when fewer than `tasksPerBoard(opts.freeSpace)` tasks are eligible.
 */
export function dealBoard(
  tasks: readonly PoolTask[],
  seats: readonly Seat[],
  seatId: string,
  rng: () => number = Math.random,
  opts: DealOptions = LEGACY_DEAL,
): BoardCell[] {
  const eligible = tasks.filter((t) => isEligible(t, seatId, opts));
  if (eligible.length < tasksPerBoard(opts.freeSpace)) throw new Error('insufficient-pool');
  const others = seats.filter((s) => s.seatId !== seatId);
  const grid = placeBoard({ items: eligible, gridSize: GRID_SIZE, centerType: centerTypeFor(opts.freeSpace), randomize: true, rng });
  return grid.map((task): BoardCell => {
    if (!task) return { kind: 'free' };
    const someoneName = others.length ? others[Math.floor(rng() * others.length)].name : null;
    const { text, refs } = resolveMentionRefs(task.text, seats, someoneName);
    return refs.length ? { kind: 'task', taskId: task.id, text, refs } : { kind: 'task', taskId: task.id, text };
  });
}

/**
 * Assigns each `@anyone` task to exactly one seat: shuffles the `@anyone` tasks
 * and the seats, then gives each task, in turn, to the seat holding the fewest
 * so far (earliest in the shuffled seat order on a tie). For pure `@anyone`
 * tasks (naming no seat) this is exactly round-robin over the shuffled seats,
 * so every seat receives `floor(n / seats)` or `ceil(n / seats)` of them. A
 * mixed `@anyone` + `@Name` task goes to one seat it does not name (the
 * emptiest such seat); one that names every seat stays unassigned. Filling the
 * emptiest seat keeps every seat at >= `floor(pure / seats)` either way.
 *
 * @returns task id → seat id (empty without seats or `@anyone` tasks).
 */
export function assignAnyone(
  tasks: readonly PoolTask[],
  seats: readonly Seat[],
  rng: () => number,
): Record<string, string> {
  const out: Record<string, string> = {};
  const anyone = fisherYatesShuffle(tasks.filter((t) => t.mentions.anyone), rng);
  const order = fisherYatesShuffle(seats, rng);
  if (!order.length) return out;
  const counts = order.map(() => 0);
  for (const task of anyone) {
    let pick = -1;
    order.forEach((seat, i) => {
      if (canBeDealt(task, seat.seatId) && (pick < 0 || counts[i] < counts[pick])) pick = i;
    });
    if (pick < 0) continue;
    out[task.id] = order[pick].seatId;
    counts[pick] += 1;
  }
  return out;
}
