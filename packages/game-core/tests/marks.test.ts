import { applyMark } from '../src/marks';

const base = () => { const m = new Array(25).fill(false); m[12] = true; return m; };

describe('applyMark', () => {
  it('index 12 is a no-op', () => {
    const marks = base();
    const r = applyMark({ marks, announcedLines: [] }, 12);
    expect(r.marks).toEqual(marks);
    expect(r.marks[12]).toBe(true);
    expect(r.newLines).toEqual([]);
  });
  it('completing row 0 yields row_0 without mutating input', () => {
    const marks = base(); [0, 1, 2, 3].forEach((i) => (marks[i] = true));
    const copy = [...marks];
    const r = applyMark({ marks, announcedLines: [] }, 4);
    expect(r.newLines).toEqual(['row_0']);
    expect(r.completedLines).toEqual(['row_0']);
    expect(marks).toEqual(copy);
  });
  const intersect = () => { const m = base(); [1, 2, 3, 4, 5, 10, 15, 20].forEach((i) => (m[i] = true)); return m; };
  it('reports two lines completed by one toggle at an intersection', () => {
    const r = applyMark({ marks: intersect(), announcedLines: [] }, 0);
    expect(r.newLines).toEqual(['row_0', 'col_0']);
    expect(r.newLines).not.toContain('diag_main');
  });
  it('excludes already-announced lines from the intersection result', () => {
    const r = applyMark({ marks: intersect(), announcedLines: ['col_0'] }, 0);
    expect(r.newLines).toEqual(['row_0']);
    expect(r.completedLines).toEqual(['row_0', 'col_0']);
  });
  it('re-marking an announced line yields no new lines', () => {
    const marks = base(); [0, 1, 2, 3, 4].forEach((i) => (marks[i] = true));
    const off = applyMark({ marks, announcedLines: ['row_0'] }, 3);
    expect(off.marks[3]).toBe(false);
    const on = applyMark({ marks: off.marks, announcedLines: ['row_0'] }, 3);
    expect(on.completedLines).toContain('row_0');
    expect(on.newLines).toEqual([]);
  });
  it('throws out of range', () => {
    expect(() => applyMark({ marks: base(), announcedLines: [] }, 25)).toThrow();
    expect(() => applyMark({ marks: base(), announcedLines: [] }, -1)).toThrow();
    expect(() => applyMark({ marks: base(), announcedLines: [] }, 1.5)).toThrow();
  });
});
