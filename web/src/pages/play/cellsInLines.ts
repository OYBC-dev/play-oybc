const SIZE = 5;

/** Cell indices (5x5, row-major) of one line id, or [] if the id is unknown. */
function lineCells(line: string): number[] {
  const range = [0, 1, 2, 3, 4];
  const m = /^(row|col)_([0-4])$/.exec(line);
  if (m) {
    const n = Number(m[2]);
    return range.map((i) => (m[1] === 'row' ? n * SIZE + i : i * SIZE + n));
  }
  if (line === 'diag_main') return range.map((i) => i * SIZE + i);
  if (line === 'diag_anti') return range.map((i) => i * SIZE + (SIZE - 1 - i));
  return [];
}

/** Every cell index belonging to any of the given completed lines. */
export function cellsInLines(lines: string[]): Set<number> {
  return new Set(lines.flatMap(lineCells));
}
