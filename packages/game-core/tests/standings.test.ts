import { detectBingos, lineCells, standings } from '../src/bingoDetection';
import { Seat } from '../src/types';

const seats: Seat[] = [
  { seatId: 'a', name: 'Ann', joinedAt: 0 },
  { seatId: 'b', name: 'Bo', joinedAt: 1 },
  { seatId: 'c', name: 'Cy', joinedAt: 2 },
  { seatId: 'd', name: 'Di', joinedAt: 3 },
];
const marksOf = (idx: number[], centre = false) => {
  const m = new Array(25).fill(false);
  idx.forEach((i) => (m[i] = true));
  if (centre) m[12] = true;
  return m;
};

describe('lineCells', () => {
  it('has 12 lines on a 5x5 with the detector ids', () => {
    const lines = lineCells(5);
    expect(lines).toHaveLength(12);
    expect(lines.map((l) => l.id)).toEqual([
      'row_0', 'row_1', 'row_2', 'row_3', 'row_4', 'col_0', 'col_1', 'col_2', 'col_3', 'col_4', 'diag_main', 'diag_anti',
    ]);
    expect(lines.find((l) => l.id === 'diag_anti')!.cells).toEqual([4, 8, 12, 16, 20]);
    expect(lines.find((l) => l.id === 'col_1')!.cells).toEqual([1, 6, 11, 16, 21]);
    for (const l of lines) expect(detectBingos(marksOf(l.cells), 5).completedLines).toEqual([l.id]);
  });
});

describe('standings', () => {
  it('marked excludes the free centre; counts it without free space', () => {
    const board = { seatId: 'a', marks: marksOf([0, 1], true), announcedLines: [], firstBingoSeq: null };
    expect(standings([board], seats, { freeSpace: true })[0]).toEqual({
      seatId: 'a', name: 'Ann', bingos: 0, marked: 2, bestLine: 2, firstBingoSeq: null,
    });
    expect(standings([board], seats, { freeSpace: false })[0].marked).toBe(3);
  });
  it('the free centre counts toward bestLine only with free space', () => {
    const board = { seatId: 'a', marks: marksOf([10, 11]), announcedLines: [], firstBingoSeq: null };
    expect(standings([board], seats, { freeSpace: true })[0].bestLine).toBe(3);
    expect(standings([board], seats, { freeSpace: false })[0].bestLine).toBe(2);
  });
  it('bestLine ignores completed lines', () => {
    const board = { seatId: 'a', marks: marksOf([0, 1, 2, 3, 4, 5, 10]), announcedLines: ['row_0'], firstBingoSeq: 1 };
    const s = standings([board], seats, { freeSpace: false })[0];
    expect(s.bingos).toBe(1);
    expect(s.bestLine).toBe(3);
    expect(s.marked).toBe(7);
  });
  it('sorts by bingos, first bingo, best line, marked, then name', () => {
    const rows = standings([
      { seatId: 'd', marks: marksOf([0, 1]), announcedLines: [], firstBingoSeq: null },
      { seatId: 'c', marks: marksOf([0, 1, 6]), announcedLines: [], firstBingoSeq: null },
      { seatId: 'b', marks: marksOf([0, 1, 2, 3, 4]), announcedLines: ['row_0'], firstBingoSeq: 5 },
      { seatId: 'a', marks: marksOf([5, 6, 7, 8, 9]), announcedLines: ['row_1'], firstBingoSeq: 2 },
    ], seats, { freeSpace: false });
    expect(rows.map((r) => r.seatId)).toEqual(['a', 'b', 'c', 'd']);
    const tie = standings([
      { seatId: 'b', marks: marksOf([0]), announcedLines: [], firstBingoSeq: null },
      { seatId: 'a', marks: marksOf([24]), announcedLines: [], firstBingoSeq: null },
    ], seats, { freeSpace: false });
    expect(tie.map((r) => r.name)).toEqual(['Ann', 'Bo']);
    const nullLast = standings([
      { seatId: 'a', marks: marksOf([0, 1, 2, 3, 4]), announcedLines: ['row_0'], firstBingoSeq: null },
      { seatId: 'b', marks: marksOf([0, 1, 2, 3, 4]), announcedLines: ['row_0'], firstBingoSeq: 9 },
    ], seats, { freeSpace: false });
    expect(nullLast.map((r) => r.seatId)).toEqual(['b', 'a']);
  });
});
