import { CENTER_INDEX, GRID_SIZE } from './constants';
import { detectBingos } from './bingoDetection';

/**
 * Marks or unmarks one square and detects lines. With `desired` omitted the
 * square flips; with `desired` given it is SET to that value (idempotent: a
 * repeat of the same request changes nothing). With `opts.freeSpace` (the
 * default) the FREE center (index 12) is always marked and a tap on it is a
 * no-op; without it the center is an ordinary cell. Does not mutate its input.
 *
 * @param state the board's current marks and already-announced lines
 * @param index cell index 0..24
 * @param desired optional target value; omitted = flip
 * @param opts the game's free-space option; defaults to free space on
 * @returns new marks, all completed lines, those not yet in `announcedLines`, and
 *   `changed` (false when the square already held the target value).
 * @throws Error when `index` is not an integer in 0..24.
 */
export function applyMark(
  state: { marks: boolean[]; announcedLines: string[] },
  index: number,
  desired?: boolean,
  opts: { freeSpace: boolean } = { freeSpace: true },
): { marks: boolean[]; completedLines: string[]; newLines: string[]; changed: boolean } {
  if (!Number.isInteger(index) || index < 0 || index >= GRID_SIZE * GRID_SIZE) {
    throw new Error('cell-out-of-range');
  }
  const marks = [...state.marks];
  if (opts.freeSpace) marks[CENTER_INDEX] = true;
  let changed = false;
  if (!opts.freeSpace || index !== CENTER_INDEX) {
    const next = desired === undefined ? !marks[index] : desired;
    changed = next !== Boolean(marks[index]);
    marks[index] = next;
  }
  const { completedLines } = detectBingos(marks, GRID_SIZE);
  const newLines = completedLines.filter((l) => !state.announcedLines.includes(l));
  return { marks, completedLines, newLines, changed };
}
