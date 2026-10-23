import { cellsInLines } from './cellsInLines';

describe('cellsInLines', () => {
  it('maps rows, columns and diagonals (row-major 5x5)', () => {
    expect([...cellsInLines(['row_1'])].sort((a, b) => a - b)).toEqual([5, 6, 7, 8, 9]);
    expect([...cellsInLines(['col_4'])].sort((a, b) => a - b)).toEqual([4, 9, 14, 19, 24]);
    expect([...cellsInLines(['diag_main'])].sort((a, b) => a - b)).toEqual([0, 6, 12, 18, 24]);
    expect([...cellsInLines(['diag_anti'])].sort((a, b) => a - b)).toEqual([4, 8, 12, 16, 20]);
  });
  it('unions lines and ignores unknown ids', () => {
    expect(cellsInLines(['row_0', 'col_0', 'nope']).size).toBe(9);
    expect(cellsInLines([]).size).toBe(0);
  });
});
