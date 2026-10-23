import { CenterSquareType } from './constants';
import { fisherYatesShuffle } from './shuffle';

/**
 * Flat index of the center cell for odd-sized boards, or -1 for even ones.
 *
 * @param gridSize - Board edge length.
 * @returns 0-based row-major center index, or -1 when no center exists.
 */
function centerIndex(gridSize: number): number {
  if (gridSize % 2 === 0) return -1;
  return Math.floor((gridSize * gridSize) / 2);
}

/**
 * Arguments for {@link placeBoard}.
 *
 * @typeParam T - The item type. Only an `id` is required so the core stays
 *   domain-agnostic.
 */
export interface PlaceBoardArgs<T extends { id: string }> {
  /** Candidate items in the caller's preferred order (used verbatim when `randomize=false`). */
  items: readonly T[];
  /** Board edge length (3, 4, 5, …). */
  gridSize: number;
  /** Center square behaviour. Ignored for even grids (no center exists). */
  centerType: CenterSquareType;
  /** Shuffle the fill pool when true; preserve `items` order when false. */
  randomize: boolean;
  /**
   * Uniform `[0, 1)` RNG for the shuffle. Defaults to `Math.random`. Tests
   * and server-side dealing pass a seeded RNG for deterministic placement.
   */
  rng?: () => number;
}

/**
 * Places `items` onto a `gridSize²` board, honouring the center-square rules.
 *
 * Semantics:
 *
 *   1. Even grids have no center (every cell is ordinary).
 *   2. Odd grid + FREE → center stays `null` (reserved; the render layer
 *      draws the FREE label).
 *   3. NONE (or even grid) → center is filled like any other cell.
 *   4. Fill pool = `randomize ? fisherYatesShuffle(items, rng) : items`
 *      (order-preserving when not randomizing).
 *   5. Walk cells `0..gridSize²-1` row-major, skipping the reserved center,
 *      placing the next pool item. Extra items are ignored; an exhausted
 *      pool leaves `null`s.
 *
 * Never mutates `items` (the shuffle copies).
 *
 * @returns A length `gridSize²` array; `null` = empty cell (reserved
 *   FREE center, or pool underfill).
 */
export function placeBoard<T extends { id: string }>(
  args: PlaceBoardArgs<T>,
): (T | null)[] {
  const { items, gridSize, centerType, randomize, rng } = args;
  const total = gridSize * gridSize;
  const centerIdx = centerIndex(gridSize);
  const ordered = randomize ? fisherYatesShuffle(items, rng) : items;

  const grid: (T | null)[] = new Array(total).fill(null);
  let next = 0;
  for (let cell = 0; cell < total; cell++) {
    // Reserved FREE center — leave null.
    if (cell === centerIdx && centerType === CenterSquareType.FREE) continue;
    if (next < ordered.length) {
      grid[cell] = ordered[next];
      next += 1;
    }
  }
  return grid;
}

/**
 * Number of cells a task pool must fill: total cells minus a reserved
 * center. Even grids have no center; odd grids reserve one cell only for
 * a FREE center.
 *
 * @param gridSize - Board edge length.
 * @param centerType - Center square behaviour.
 * @returns The number of cells a pool must fill.
 */
export function fillableCellCount(
  gridSize: number,
  centerType: CenterSquareType,
): number {
  const reservesCenter =
    centerIndex(gridSize) >= 0 && centerType === CenterSquareType.FREE;
  return gridSize * gridSize - (reservesCenter ? 1 : 0);
}
