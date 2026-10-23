import * as fs from 'fs';
import * as path from 'path';
import { placeBoard } from '../src/placement';
import { CenterSquareType } from '../src/constants';

/**
 * `tests/fixtures/placementVectors.json` pins the seeded-LCG placement cases as
 * one canonical source of expected arrays, so a behavioral drift in
 * `placeBoard` fails here rather than hiding behind hand-copied expectations.
 */

interface PlaceBoardVector {
  name: string;
  itemIds: string[];
  gridSize: number;
  centerType: string;
  randomize: boolean;
  seed: number | null;
  expected: (string | null)[];
}

interface Fixture {
  placeBoardVectors: PlaceBoardVector[];
}

const FIXTURE_PATH = path.join(__dirname, 'fixtures/placementVectors.json');
const fixture: Fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

/** Inlined so a vector's `seed` field alone reproduces the RNG stream. */
function makeSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe('placementVectors fixture', () => {
  it('is non-empty', () => {
    expect(fixture.placeBoardVectors.length).toBeGreaterThan(0);
  });
});

describe('placeBoard — cross-platform vectors', () => {
  it.each(fixture.placeBoardVectors.map((v) => [v.name, v] as const))(
    '%s',
    (_name, vector) => {
      const items = vector.itemIds.map((id) => ({ id }));
      const placement = placeBoard({
        items,
        gridSize: vector.gridSize,
        centerType: vector.centerType as CenterSquareType,
        randomize: vector.randomize,
        rng: vector.seed != null ? makeSeededRng(vector.seed) : undefined,
      });
      expect(placement.map((t) => t?.id ?? null)).toEqual(vector.expected);
    },
  );
});
