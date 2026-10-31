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
  it('desired=true twice: second call is unchanged and announces nothing new', () => {
    const marks = base(); [0, 1, 2, 3].forEach((i) => (marks[i] = true));
    const first = applyMark({ marks, announcedLines: [] }, 4, true);
    expect(first.changed).toBe(true);
    expect(first.newLines).toEqual(['row_0']);
    const second = applyMark({ marks: first.marks, announcedLines: ['row_0'] }, 4, true);
    expect(second.changed).toBe(false);
    expect(second.marks).toEqual(first.marks);
    expect(second.newLines).toEqual([]);
  });
  it('desired=false on an unmarked square is unchanged', () => {
    const r = applyMark({ marks: base(), announcedLines: [] }, 3, false);
    expect(r.changed).toBe(false);
    expect(r.marks).toEqual(base());
  });
  it('desired omitted flips and reports changed', () => {
    const on = applyMark({ marks: base(), announcedLines: [] }, 3);
    expect(on.marks[3]).toBe(true);
    expect(on.changed).toBe(true);
    const off = applyMark({ marks: on.marks, announcedLines: [] }, 3);
    expect(off.marks[3]).toBe(false);
    expect(off.changed).toBe(true);
  });
  it('center with desired=false stays marked and unchanged', () => {
    const r = applyMark({ marks: base(), announcedLines: [] }, 12, false);
    expect(r.marks[12]).toBe(true);
    expect(r.changed).toBe(false);
  });
  it('throws out of range', () => {
    expect(() => applyMark({ marks: base(), announcedLines: [] }, 25)).toThrow();
    expect(() => applyMark({ marks: base(), announcedLines: [] }, -1)).toThrow();
    expect(() => applyMark({ marks: base(), announcedLines: [] }, 1.5)).toThrow();
  });
  describe('freeSpace:false', () => {
    const empty = () => new Array(25).fill(false);
    it('tapping 12 toggles it and the centre is not forced', () => {
      const on = applyMark({ marks: empty(), announcedLines: [] }, 12, undefined, { freeSpace: false });
      expect(on.marks[12]).toBe(true);
      expect(on.changed).toBe(true);
      const off = applyMark({ marks: on.marks, announcedLines: [] }, 12, undefined, { freeSpace: false });
      expect(off.marks[12]).toBe(false);
      const other = applyMark({ marks: empty(), announcedLines: [] }, 3, undefined, { freeSpace: false });
      expect(other.marks[12]).toBe(false);
    });
    it('the centre counts toward lines', () => {
      const m = empty(); [10, 11, 13, 14].forEach((i) => (m[i] = true));
      const r = applyMark({ marks: m, announcedLines: [] }, 12, true, { freeSpace: false });
      expect(r.newLines).toEqual(['row_2']);
    });
    it('default keeps the forced centre', () => {
      const r = applyMark({ marks: empty(), announcedLines: [] }, 3);
      expect(r.marks[12]).toBe(true);
    });
  });
});
