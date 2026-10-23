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

/** The pool as one viewer sees it: createdAt-ascending, hidden texts nulled. */
export function buildPoolView(
  tasks: readonly PoolTask[],
  seats: readonly Seat[],
  viewerSeatId: string,
): PoolViewEntry[] {
  const names = new Map(seats.map((s) => [s.seatId, s.name]));
  return [...tasks]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((t) => ({
      taskId: t.id,
      authorName: names.get(t.authorSeatId) ?? '',
      text: canSeeText(t, viewerSeatId) ? t.text : null,
      mine: t.authorSeatId === viewerSeatId,
    }));
}
