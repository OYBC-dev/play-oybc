import { resolveMentionRefs } from './mentions';
import { PoolTask, PoolViewEntry, Seat } from './types';

/** Whether the viewer may read the task's text. Authors always can; mentioned players and @someone/@anyone audiences cannot. */
export function canSeeText(task: PoolTask, viewerSeatId: string): boolean {
  if (task.authorSeatId === viewerSeatId) return true;
  if (task.mentions.someone || task.mentions.anyone) return false;
  return !task.mentions.seatIds.includes(viewerSeatId);
}

/** Whether the task may be dealt to this seat (never to a named mention). */
export function canBeDealt(task: PoolTask, seatId: string): boolean {
  return !task.mentions.seatIds.includes(seatId);
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
  const names = new Map(seats.map((s) => [s.seatId, s.name]));
  return [...tasks]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((t): PoolViewEntry => {
      const base = { taskId: t.id, authorName: names.get(t.authorSeatId) ?? '' };
      const mine = t.authorSeatId === viewerSeatId;
      if (!canSeeText(t, viewerSeatId)) return { ...base, text: null, mine };
      const { text, refs } = resolveMentionRefs(t.text, seats, POOL_SOMEONE_NAME);
      return refs.length ? { ...base, text, refs, mine } : { ...base, text, mine };
    });
}
