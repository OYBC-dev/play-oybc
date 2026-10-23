import { BoardSize } from './constants';

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

  const completedLines: string[] = [];
  let totalCompleted = 0;

  // Count total completed squares
  for (let i = 0; i < totalSquares; i++) {
    if (completionGrid[i]) {
      totalCompleted++;
    }
  }

  // Check rows
  for (let row = 0; row < gridSize; row++) {
    let rowComplete = true;
    for (let col = 0; col < gridSize; col++) {
      if (!completionGrid[row * gridSize + col]) {
        rowComplete = false;
        break;
      }
    }
    if (rowComplete) {
      completedLines.push(`row_${row}`);
    }
  }

  // Check columns
  for (let col = 0; col < gridSize; col++) {
    let colComplete = true;
    for (let row = 0; row < gridSize; row++) {
      if (!completionGrid[row * gridSize + col]) {
        colComplete = false;
        break;
      }
    }
    if (colComplete) {
      completedLines.push(`col_${col}`);
    }
  }

  // Check main diagonal (top-left to bottom-right)
  let mainDiagComplete = true;
  for (let i = 0; i < gridSize; i++) {
    if (!completionGrid[i * gridSize + i]) {
      mainDiagComplete = false;
      break;
    }
  }
  if (mainDiagComplete) {
    completedLines.push('diag_main');
  }

  // Check anti diagonal (top-right to bottom-left)
  let antiDiagComplete = true;
  for (let i = 0; i < gridSize; i++) {
    if (!completionGrid[i * gridSize + (gridSize - 1 - i)]) {
      antiDiagComplete = false;
      break;
    }
  }
  if (antiDiagComplete) {
    completedLines.push('diag_anti');
  }

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
