import { tasksPerBoard } from './deal';
import { PoolTask, Seat } from './types';
import { MentionContext, canBeDealt, mentionContext, scanOf } from './visibility';

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
 * @param ctx a context built for these tasks and seats, to share with other derivations
 * @returns seatId → guaranteed dealable count.
 */
export function dealableCounts(
  tasks: readonly PoolTask[],
  seats: readonly Seat[],
  opts: { freeSpace: boolean },
  ctx: MentionContext = mentionContext(tasks, seats),
): Record<string, number> {
  void opts;
  const pure = (t: PoolTask) => {
    if (!t.mentions.anyone) return false;
    const scan = scanOf(t, ctx);
    return scan.referenced.size === 0 && !scan.unbound;
  };
  const anyoneCount = tasks.filter(pure).length;
  const anyoneShare = seats.length ? Math.floor(anyoneCount / seats.length) : 0;
  const out: Record<string, number> = {};
  for (const seat of seats) {
    out[seat.seatId] = tasks.filter((t) => !t.mentions.anyone && canBeDealt(t, seat.seatId, ctx)).length + anyoneShare;
  }
  return out;
}

/**
 * Launch readiness from counts already computed: for each seat whose count is
 * below `needed`, how many more it needs.
 *
 * @returns Map of seatId to shortfall; seats that are ready are omitted.
 */
export function shortfallsFromCounts(counts: Readonly<Record<string, number>>, needed: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [seatId, count] of Object.entries(counts)) if (count < needed) out[seatId] = needed - count;
  return out;
}

/**
 * Launch readiness: for each seat whose guaranteed dealable count (see
 * {@link dealableCounts}) is below `tasksPerBoard(opts.freeSpace)`, how many more it needs.
 *
 * @param opts defaults to free space on (24 per board)
 * @param ctx a context built for these tasks and seats, to share with other derivations
 * @returns Map of seatId to shortfall; seats that are ready are omitted.
 */
export function shortfalls(
  tasks: readonly PoolTask[],
  seats: readonly Seat[],
  opts: { freeSpace: boolean } = { freeSpace: true },
  ctx: MentionContext = mentionContext(tasks, seats),
): Record<string, number> {
  return shortfallsFromCounts(dealableCounts(tasks, seats, opts, ctx), tasksPerBoard(opts.freeSpace));
}
