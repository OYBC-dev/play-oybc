import * as fs from 'fs';
import * as path from 'path';
import {
  detectBingos,
  totalLineCount,
  BingoDetectionResult,
} from '../src/bingoDetection';
import type { BoardSize } from '../src/constants';

/**
 * Vector cases are fixture-driven from `tests/fixtures/bingoDetectionVectors.json`.
 * The `uncomplete cascade scenarios` block is hand-written: those tests call
 * `detectBingos` twice (before + after a square is un-completed) and diff the
 * results.
 */

const FIXTURE_PATH = path.join(__dirname, 'fixtures/bingoDetectionVectors.json');

interface DetectVector {
  name: string;
  gridSize: number;
  completedIndices: number[];
  expected: BingoDetectionResult;
}

interface ErrorVector {
  name: string;
  completionGrid: boolean[];
  gridSize: number;
  expectedError: string;
}

interface Fixture {
  detectBingos: DetectVector[];
  errorHandling: ErrorVector[];
}

const fixture: Fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

function makeGrid(size: number, completed: number[]): boolean[] {
  const grid = new Array(size * size).fill(false);
  for (const i of completed) grid[i] = true;
  return grid;
}

describe('detectBingos (fixture-driven, tests/fixtures/bingoDetectionVectors.json)', () => {
  it('fixture is non-empty', () => {
    expect(fixture.detectBingos.length).toBeGreaterThan(0);
  });

  for (const v of fixture.detectBingos) {
    it(v.name, () => {
      const grid = makeGrid(v.gridSize, v.completedIndices);
      const result = detectBingos(grid, v.gridSize as BoardSize);
      expect(result).toEqual(v.expected);
    });
  }
});

describe('detectBingos error handling (fixture-driven)', () => {
  it('fixture is non-empty', () => {
    expect(fixture.errorHandling.length).toBeGreaterThan(0);
  });

  for (const v of fixture.errorHandling) {
    it(v.name, () => {
      expect(() => detectBingos(v.completionGrid, v.gridSize as BoardSize)).toThrow(v.expectedError);
    });
  }
});

// ── Uncomplete Cascade Scenarios ──────
describe('uncomplete cascade scenarios', () => {
  const size = 3;
  const total = 9;

  function makeGridLocal(completedIndices: number[]): boolean[] {
    const grid = new Array(total).fill(false);
    for (const i of completedIndices) {
      grid[i] = true;
    }
    return grid;
  }

  it('complete a row then uncomplete one square — bingo disappears', () => {
    const gridBefore = makeGridLocal([0, 1, 2]);
    const before = detectBingos(gridBefore, size);
    expect(before.completedLines).toContain('row_0');

    const gridAfter = makeGridLocal([0, 2]);
    const after = detectBingos(gridAfter, size);
    expect(after.completedLines).not.toContain('row_0');

    const currentLines = new Set(after.completedLines);
    const lostBingos = before.completedLines.filter((l) => !currentLines.has(l));
    expect(lostBingos).toEqual(['row_0']);
  });

  it('complete greenlog then uncomplete one square — isGreenlog becomes false', () => {
    const gridBefore = new Array(total).fill(true);
    const before = detectBingos(gridBefore, size);
    expect(before.isGreenlog).toBe(true);
    expect(before.completedLines.length).toBe(8);

    const gridAfter = makeGridLocal([1, 2, 3, 4, 5, 6, 7, 8]);
    const after = detectBingos(gridAfter, size);
    expect(after.isGreenlog).toBe(false);
    expect(after.completedLines.length).toBeLessThan(before.completedLines.length);
  });

  it('uncomplete a square that affects multiple bingos — both lost', () => {
    const gridBefore = makeGridLocal([1, 3, 4, 5, 7]);
    const before = detectBingos(gridBefore, size);
    expect(before.completedLines).toContain('row_1');
    expect(before.completedLines).toContain('col_1');

    const gridAfter = makeGridLocal([1, 3, 5, 7]);
    const after = detectBingos(gridAfter, size);
    expect(after.completedLines).not.toContain('row_1');
    expect(after.completedLines).not.toContain('col_1');

    const currentLines = new Set(after.completedLines);
    const lostBingos = before.completedLines.filter((l) => !currentLines.has(l));
    expect(lostBingos).toContain('row_1');
    expect(lostBingos).toContain('col_1');
    expect(lostBingos.length).toBe(2);
  });

  it('uncomplete a non-bingo square — no bingos lost', () => {
    const gridBefore = makeGridLocal([0, 1, 2, 3, 5, 8]);
    const before = detectBingos(gridBefore, size);
    expect(before.completedLines).toContain('row_0');
    expect(before.completedLines).toContain('col_2');

    const gridAfter = makeGridLocal([0, 1, 2, 5, 8]);
    const after = detectBingos(gridAfter, size);

    const currentLines = new Set(after.completedLines);
    const lostBingos = before.completedLines.filter((l) => !currentLines.has(l));
    expect(lostBingos).toEqual([]);
    expect(after.completedLines).toContain('row_0');
    expect(after.completedLines).toContain('col_2');
  });
});

describe('totalLineCount', () => {
  it.each([
    [3, 8],
    [4, 10],
    [5, 12],
  ])('a %dx%d board has %d lines', (size, expected) => {
    expect(totalLineCount(size as BoardSize)).toBe(expected);
  });

  it('equals every line id detectBingos can emit on a full board', () => {
    for (const size of [3, 4, 5] as BoardSize[]) {
      const full = detectBingos(new Array(size * size).fill(true), size);
      expect(full.completedLines).toHaveLength(totalLineCount(size));
    }
  });
});
