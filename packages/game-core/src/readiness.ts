import { tasksPerBoard } from './deal';
import { NameStates, PoolTask, Seat } from './types';
import { MentionContext, mentionContext, scanOf } from './visibility';

/**
 * Tasks each seat is guaranteed at launch: the non-`@anyone` tasks dealable to
 * it, plus `floor(pureAnyone / seats.length)` where `pureAnyone` counts only
 * `@anyone` tasks that name nobody — the minimum `assignAnyone` hands every
 * seat. A mixed `@anyone` + `@Name` task (seated or not) counts toward no seat
 * (neither the share nor the per-seat count). A task naming someone not here
 * yet counts only for identified seats (see `mentionContext`). A seat at or
 * above `tasksPerBoard` therefore always deals.
 *
 * @param opts the game's options; only `names` (the host's name names) affects the count
 * @param ctx a context built for these tasks and seats, to share with other derivations
 * @returns seatId → guaranteed dealable count.
 */
export function dealableCounts(
  tasks: readonly PoolTask[],
  seats: readonly Seat[],
  opts: { freeSpace: boolean; names?: NameStates },
  ctx: MentionContext = mentionContext(tasks, seats, opts.names),
): Record<string, number> {
  const pure = (t: PoolTask) => t.mentions.anyone && scanOf(t, ctx).referenced.size === 0;
  const anyoneCount = tasks.filter(pure).length;
  const anyoneShare = seats.length ? Math.floor(anyoneCount / seats.length) : 0;
  const out: Record<string, number> = {};
  for (const seat of seats) {
    out[seat.seatId] = tasks.filter((t) => !t.mentions.anyone && !scanOf(t, ctx).referenced.has(seat.seatId)).length + anyoneShare;
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
  opts: { freeSpace: boolean; names?: NameStates } = { freeSpace: true },
  ctx: MentionContext = mentionContext(tasks, seats, opts.names),
): Record<string, number> {
  return shortfallsFromCounts(dealableCounts(tasks, seats, opts, ctx), tasksPerBoard(opts.freeSpace));
}
