import { resolveMentionRefs, scanMentions } from './mentions';
import { isNearName, nameKey } from './names';
import { PoolTask, PoolViewEntry, Seat } from './types';

/**
 * What visibility and dealing resolve a task against: the current seats and
 * the seats some task refers to by name (`identified`). A task that names
 * someone not here yet is kept from every seat that is not identified, since
 * any of them might be that person; a seat the pool already refers to is known
 * under that name and may see and receive such tasks.
 */
export interface MentionContext {
  seats: readonly Seat[];
  identified: ReadonlySet<string>;
  /** One scan per task, by task id (a task missing here is scanned on demand). */
  scans: ReadonlyMap<string, TaskScan>;
}

/** What one task's text refers to against a seat list. */
export interface TaskScan {
  /** Seats the task refers to: stored at authoring, matched by name now, or nearly named (`isNearName`). */
  referenced: ReadonlySet<string>;
  /** Whether the text names someone no current seat matches. */
  unbound: boolean;
}

/**
 * Scans one task against the current seats: the seats matched when it was
 * written, every `@Name` that matches a seat now (a name written before its
 * person joined resolves the moment they do), and every seat an unbound name
 * nearly names ("@Cody" keeps the task from "Cody B").
 */
export function scanTask(task: PoolTask, seats: readonly Seat[]): TaskScan {
  const referenced = new Set(task.mentions.seatIds);
  let unbound = false;
  for (const t of scanMentions(task.text, seats)) {
    if (t.kind === 'seat') referenced.add(t.seat.seatId);
    else if (t.kind === 'unknown') {
      unbound = true;
      const key = nameKey(t.token.slice(1));
      for (const s of seats) if (isNearName(key, nameKey(s.name))) referenced.add(s.seatId);
    }
  }
  return { referenced, unbound };
}

/** The seats a task refers to right now (see {@link scanTask}). */
export function referencedSeatIds(task: PoolTask, seats: readonly Seat[]): Set<string> {
  return new Set(scanTask(task, seats).referenced);
}

/** Whether the task names someone no current seat matches. */
export function hasUnboundName(task: PoolTask, seats: readonly Seat[]): boolean {
  return scanTask(task, seats).unbound;
}

/** The context for `tasks` and `seats`: each task scanned once; identified = every seat some task refers to. */
export function mentionContext(tasks: readonly PoolTask[], seats: readonly Seat[]): MentionContext {
  const identified = new Set<string>();
  const scans = new Map<string, TaskScan>();
  for (const task of tasks) {
    const scan = scanTask(task, seats);
    scans.set(task.id, scan);
    for (const id of scan.referenced) identified.add(id);
  }
  return { seats, identified, scans };
}

/** The task's scan from the context, or a fresh one for a task the context never saw. */
export function scanOf(task: PoolTask, ctx: MentionContext): TaskScan {
  return ctx.scans.get(task.id) ?? scanTask(task, ctx.seats);
}

/** Whether `seatId` is kept from the task: it refers to them, or it names someone absent and the seat is not identified. */
function keptFrom(task: PoolTask, seatId: string, ctx: MentionContext): boolean {
  const scan = scanOf(task, ctx);
  if (scan.referenced.has(seatId)) return true;
  return scan.unbound && !ctx.identified.has(seatId);
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
 *
 * @param ctx a context built for these tasks and seats, to share across viewers
 */
export function buildPoolView(
  tasks: readonly PoolTask[],
  seats: readonly Seat[],
  viewerSeatId: string,
  ctx: MentionContext = mentionContext(tasks, seats),
): PoolViewEntry[] {
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
