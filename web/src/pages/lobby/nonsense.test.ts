import { NONSENSE_MAX, NONSENSE_MIN, nonsenseFor } from './nonsense';

describe('nonsenseFor', () => {
  it('is stable per task id', () => {
    expect(nonsenseFor('t2')).toBe(nonsenseFor('t2'));
    expect(nonsenseFor('abc123')).toBe(nonsenseFor('abc123'));
  });

  it('stays within the length bounds for many ids', () => {
    for (let i = 0; i < 500; i++) {
      const s = nonsenseFor(`task-${i}`);
      expect(s.length).toBeGreaterThanOrEqual(NONSENSE_MIN);
      expect(s.length).toBeLessThanOrEqual(NONSENSE_MAX);
      expect(s).toMatch(/^[a-z]+( [a-z]+)*$/);
    }
  });

  it('varies length across ids', () => {
    const lengths = new Set(Array.from({ length: 100 }, (_, i) => nonsenseFor(`id${i}`).length));
    expect(lengths.size).toBeGreaterThan(10);
  });

  it('differs between ids', () => {
    expect(nonsenseFor('a')).not.toBe(nonsenseFor('b'));
  });
});
