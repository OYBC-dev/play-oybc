import { tasksPerBoard } from './deal';
import { PoolTask, Seat } from './types';
import { canBeDealt, hasUnboundName, mentionContext, referencedSeatIds } from './visibility';

/**
 * Tasks each seat is guaranteed at launch: the non-`@anyone` tasks dealable to
 * it, plus `floor(pureAnyone / seats.length)` where `pureAnyone` counts only
 * `@anyone` tasks that name nobody — the minimum `assignAnyone` hands every
 * seat. A mixed `@anyone` + `@Name` task (seated or not) counts toward no seat
 * (neither the share nor the per-seat count). A task naming someone not here
 * yet counts only for identified seats (see `mentionContext`). A seat at or
 * above `tasksPerBoard` therefore always deals.
 *
 * @param opts the game's options (accepted for symmetry with `shortfalls`; the count does not depend on them)
 * @returns seatId → guaranteed dealable count.
 */
export function dealableCounts(
  tasks: readonly PoolTask[],
  seats: readonly Seat[],
  opts: { freeSpace: boolean },
): Record<string, number> {
  void opts;
  const ctx = mentionContext(tasks, seats);
  const pure = (t: PoolTask) => t.mentions.anyone && referencedSeatIds(t, seats).size === 0 && !hasUnboundName(t, seats);
  const anyoneCount = tasks.filter(pure).length;
  const anyoneShare = seats.length ? Math.floor(anyoneCount / seats.length) : 0;
  const out: Record<string, number> = {};
  for (const seat of seats) {
    out[seat.seatId] = tasks.filter((t) => !t.mentions.anyone && canBeDealt(t, seat.seatId, ctx)).length + anyoneShare;
  }
  return out;
}

/**
 * Launch readiness: for each seat whose guaranteed dealable count (see
 * {@link dealableCounts}) is below `tasksPerBoard(opts.freeSpace)`, how many more it needs.
 *
 * @param opts defaults to free space on (24 per board)
 * @returns Map of seatId to shortfall; seats that are ready are omitted.
 */
export function shortfalls(
  tasks: readonly PoolTask[],
  seats: readonly Seat[],
  opts: { freeSpace: boolean } = { freeSpace: true },
): Record<string, number> {
  const needed = tasksPerBoard(opts.freeSpace);
  const counts = dealableCounts(tasks, seats, opts);
  const out: Record<string, number> = {};
  for (const seat of seats) {
    if (counts[seat.seatId] < needed) out[seat.seatId] = needed - counts[seat.seatId];
  }
  return out;
}
