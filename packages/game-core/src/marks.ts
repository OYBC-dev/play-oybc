import { CENTER_INDEX, GRID_SIZE } from './constants';
import { detectBingos } from './bingoDetection';

/**
 * Toggles one square and detects lines. The FREE center (index 12) is always
 * marked and toggling it is a no-op. Does not mutate its input.
 *
 * @returns new marks, all completed lines, and those not yet in `announcedLines`.
 * @throws Error when `index` is not an integer in 0..24.
 */
export function applyMark(
  state: { marks: boolean[]; announcedLines: string[] },
  index: number,
): { marks: boolean[]; completedLines: string[]; newLines: string[] } {
  if (!Number.isInteger(index) || index < 0 || index >= GRID_SIZE * GRID_SIZE) {
    throw new Error('cell-out-of-range');
  }
  const marks = [...state.marks];
  marks[CENTER_INDEX] = true;
  if (index !== CENTER_INDEX) marks[index] = !marks[index];
  const { completedLines } = detectBingos(marks, GRID_SIZE);
  const newLines = completedLines.filter((l) => !state.announcedLines.includes(l));
  return { marks, completedLines, newLines };
}
