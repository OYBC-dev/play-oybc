/**
 * Deterministic uniform [0,1) LCG (Numerical Recipes constants).
 *
 * Same seed gives the same sequence, so tests can assert exact expected
 * arrays from `placeBoard` / `fisherYatesShuffle`.
 *
 * Test helper only — intentionally NOT a `src` export.
 *
 * @param seed - Unsigned 32-bit seed.
 * @returns A function yielding successive uniform `[0, 1)` samples.
 */
export function makeSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
