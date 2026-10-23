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
  it('reports two lines at once', () => {
    const marks2 = base(); [2, 7, 17, 22, 10, 11, 13].forEach((i) => (marks2[i] = true));
    const r2 = applyMark({ marks: marks2, announcedLines: [] }, 14);
    expect(r2.newLines).toEqual(['row_2', 'col_2']);
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
