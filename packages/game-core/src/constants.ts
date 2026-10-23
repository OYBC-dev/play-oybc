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

/** Play board edge length. */
export const GRID_SIZE = 5;
/** Tasks dealt to each board (25 cells minus the FREE center). */
export const TASKS_PER_BOARD = 24;
/** Flat index of the FREE center cell. */
export const CENTER_INDEX = 12;
/** Game-code length. */
export const GAME_CODE_LENGTH = 5;

/** Maximum length of a pool task's text (after trimming). */
export const MAX_TASK_LENGTH = 120;
