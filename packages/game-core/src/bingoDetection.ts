import { BoardSize, CENTER_INDEX, GRID_SIZE } from './constants';
import { Seat, Standing } from './types';

/**
 * Result of bingo detection on a board.
 *
 * @property completedLines - Array of line IDs that are complete (e.g., 'row_0', 'col_2', 'diag_main')
 * @property isGreenlog - True when ALL squares on the board are completed
 * @property totalCompleted - Number of completed squares
 * @property totalSquares - Total squares on the board (gridSize * gridSize)
 */
export interface BingoDetectionResult {
  completedLines: string[];
  isGreenlog: boolean;
  totalCompleted: number;
  totalSquares: number;
}

/**
 * Detect all completed bingo lines on a board.
 *
 * Checks all rows, columns, and diagonals for completion.
 * Returns all simultaneously completed lines and whether the
 * entire board is complete (greenlog).
 *
 * The completion grid is a flat boolean array of length gridSize * gridSize,
 * indexed row-major: index = row * gridSize + col.
 *
 * Line ID format:
 * - Rows: 'row_0', 'row_1', ... 'row_{n-1}'
 * - Columns: 'col_0', 'col_1', ... 'col_{n-1}'
 * - Main diagonal (top-left to bottom-right): 'diag_main'
 * - Anti diagonal (top-right to bottom-left): 'diag_anti'
 *
 * @param completionGrid - Flat boolean array of completed states (row-major order)
 * @param gridSize - Board size (3, 4, or 5)
 * @returns BingoDetectionResult with all detected lines and greenlog status
 * @throws Error if completionGrid length does not match gridSize * gridSize
 */
export function detectBingos(
  completionGrid: boolean[],
  gridSize: BoardSize
): BingoDetectionResult {
  const totalSquares = gridSize * gridSize;

  if (completionGrid.length !== totalSquares) {
    throw new Error(
      `completionGrid length (${completionGrid.length}) does not match gridSize * gridSize (${totalSquares})`
    );
  }

  const totalCompleted = completionGrid.filter(Boolean).length;
  const completedLines = lineCells(gridSize)
    .filter((line) => line.cells.every((i) => completionGrid[i]))
    .map((line) => line.id);

  const isGreenlog = totalCompleted === totalSquares;

  return {
    completedLines,
    isGreenlog,
    totalCompleted,
    totalSquares,
  };
}

/**
 * Total number of bingo lines on a `gridSize` board: every row, every column
 * and the two diagonals (`2 * gridSize + 2`).
 *
 * @param gridSize - Board size (3, 4, or 5)
 * @returns The number of distinct line ids `detectBingos` can emit.
 */
export function totalLineCount(gridSize: BoardSize): number {
  return 2 * gridSize + 2;
}

/**
 * Every bingo line of a `gridSize` board with its cells, in the order
 * `detectBingos` emits ids: rows, columns, `diag_main`, `diag_anti`.
 *
 * @param gridSize - Board edge length
 * @returns `{ id, cells }` per line, cells as row-major indices in line order.
 */
export function lineCells(gridSize: number): Array<{ id: string; cells: number[] }> {
  const range = Array.from({ length: gridSize }, (_, i) => i);
  return [
    ...range.map((r) => ({ id: `row_${r}`, cells: range.map((c) => r * gridSize + c) })),
    ...range.map((c) => ({ id: `col_${c}`, cells: range.map((r) => r * gridSize + c) })),
    { id: 'diag_main', cells: range.map((i) => i * gridSize + i) },
    { id: 'diag_anti', cells: range.map((i) => i * gridSize + (gridSize - 1 - i)) },
  ];
}

/** One board's play state as `standings` reads it. */
export interface StandingsBoard {
  seatId: string;
  marks: readonly boolean[];
  announcedLines: readonly string[];
  firstBingoSeq: number | null;
}

/**
 * The leaderboard: one row per board (5x5). `bingos` = announced lines;
 * `marked` = marked cells, the center excluded when `freeSpace`; `bestLine` =
 * the most marked cells in any line that is not complete (0–4; the FREE
 * center counts as marked when `freeSpace`). Ordered by `bingos` desc, then
 * `firstBingoSeq` asc (null last), `bestLine` desc, `marked` desc, `name` asc
 * (then `seatId`, for a total order). A seat missing from `seats` has name ''.
 */
export function standings(
  boards: ReadonlyArray<StandingsBoard>,
  seats: readonly Seat[],
  opts: { freeSpace: boolean },
): Standing[] {
  const names = new Map(seats.map((s) => [s.seatId, s.name]));
  const lines = lineCells(GRID_SIZE);
  const rows = boards.map((b): Standing => {
    const isMarked = (i: number) => Boolean(b.marks[i]) || (opts.freeSpace && i === CENTER_INDEX);
    let marked = 0;
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
      if (b.marks[i] && !(opts.freeSpace && i === CENTER_INDEX)) marked++;
    }
    let bestLine = 0;
    for (const line of lines) {
      const count = line.cells.filter(isMarked).length;
      if (count < line.cells.length && count > bestLine) bestLine = count;
    }
    return {
      seatId: b.seatId,
      name: names.get(b.seatId) ?? '',
      bingos: b.announcedLines.length,
      marked,
      bestLine,
      firstBingoSeq: b.firstBingoSeq,
    };
  });
  const bySeq = (a: Standing, b: Standing): number => {
    if (a.firstBingoSeq === b.firstBingoSeq) return 0;
    if (a.firstBingoSeq === null) return 1;
    if (b.firstBingoSeq === null) return -1;
    return a.firstBingoSeq - b.firstBingoSeq;
  };
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  return rows.sort(
    (a, b) =>
      b.bingos - a.bingos ||
      bySeq(a, b) ||
      b.bestLine - a.bestLine ||
      b.marked - a.marked ||
      cmp(a.name, b.name) ||
      cmp(a.seatId, b.seatId),
  );
}
