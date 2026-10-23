/**
 * Board size options
 */
export const BOARD_SIZES = [3, 4, 5] as const;
export type BoardSize = typeof BOARD_SIZES[number];

/**
 * Center square behavior
 */
export enum CenterSquareType {
  FREE = 'free', // Auto-completed (traditional bingo), shows "FREE SPACE"
  NONE = 'none', // No center square (ordinary cell)
}
