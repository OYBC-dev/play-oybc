import { resolveMentionRefs, scanMentions } from './mentions';
import { PoolTask, PoolViewEntry, Seat } from './types';

/**
 * What visibility and dealing resolve a task against: the current seats and
 * the seats some task refers to by name (`identified`). A task that names
 * someone not here yet is kept from every seat that is not identified, since
 * any of them might be that person; a seat the pool already refers to is known
 * under that name and may see and receive such tasks.
 */
export interface MentionContext { seats: readonly Seat[]; identified: ReadonlySet<string> }

/**
 * The seats a task refers to right now: the seats matched when it was written
 * plus every `@Name` in its text that matches a current seat (so a name
 * written before its person joined resolves the moment they do).
 */
export function referencedSeatIds(task: PoolTask, seats: readonly Seat[]): Set<string> {
  const out = new Set(task.mentions.seatIds);
  for (const t of scanMentions(task.text, seats)) if (t.kind === 'seat') out.add(t.seat.seatId);
  return out;
}

/** Whether the task names someone no current seat matches. */
export function hasUnboundName(task: PoolTask, seats: readonly Seat[]): boolean {
  return scanMentions(task.text, seats).some((t) => t.kind === 'unknown');
}

/** The context for `tasks` and `seats`: identified = every seat some task refers to. */
export function mentionContext(tasks: readonly PoolTask[], seats: readonly Seat[]): MentionContext {
  const identified = new Set<string>();
  for (const task of tasks) for (const id of referencedSeatIds(task, seats)) identified.add(id);
  return { seats, identified };
}

/** Whether `seatId` is kept from the task: it refers to them, or it names someone absent and the seat is not identified. */
function keptFrom(task: PoolTask, seatId: string, ctx: MentionContext): boolean {
  if (referencedSeatIds(task, ctx.seats).has(seatId)) return true;
  return !ctx.identified.has(seatId) && hasUnboundName(task, ctx.seats);
}

/**
 * Whether the viewer may read the task's text. Authors always can; `@someone` /
 * `@anyone` audiences cannot; neither can a seat the task is kept from (see {@link keptFrom}).
 */
export function canSeeText(task: PoolTask, viewerSeatId: string, ctx: MentionContext): boolean {
  if (task.authorSeatId === viewerSeatId) return true;
  if (task.mentions.someone || task.mentions.anyone) return false;
  return !keptFrom(task, viewerSeatId, ctx);
}

/** Whether the task may be dealt to this seat: never to a seat it is kept from (see {@link keptFrom}), author included. */
export function canBeDealt(task: PoolTask, seatId: string, ctx: MentionContext): boolean {
  return !keptFrom(task, seatId, ctx);
}

/** What `@someone` reads as in pool rows (the author does not know who it will be). */
const POOL_SOMEONE_NAME = 'Someone';

/**
 * The pool as one viewer sees it: createdAt-ascending, hidden texts nulled.
 * Visible texts are display texts with mention refs (see `resolveMentionRefs`;
 * `@someone` reads "Someone"); `refs` is omitted when there are none.
 */
export function buildPoolView(
  tasks: readonly PoolTask[],
  seats: readonly Seat[],
  viewerSeatId: string,
): PoolViewEntry[] {
  const ctx = mentionContext(tasks, seats);
  const names = new Map(seats.map((s) => [s.seatId, s.name]));
  return [...tasks]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((t): PoolViewEntry => {
      const base = { taskId: t.id, authorName: names.get(t.authorSeatId) ?? '' };
      const mine = t.authorSeatId === viewerSeatId;
      if (!canSeeText(t, viewerSeatId, ctx)) return { ...base, text: null, mine };
      const { text, refs } = resolveMentionRefs(t.text, seats, POOL_SOMEONE_NAME);
      return refs.length ? { ...base, text, refs, mine } : { ...base, text, mine };
    });
}
