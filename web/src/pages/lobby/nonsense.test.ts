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

  // Pinned outputs, identical to iOS `NonsenseTests.testMatchesWebVectors` so the platforms can't drift.
  it.each([
    ['t2', 'dor lofe sa um mium'],
    ['abc123', 'no dorosdor keblino qua fepri l'],
    ['a', 'bli stirasa tha dorqua nolovel rathasti no ra t'],
    ['b', 'loumra ra pri bli nyelo quanyer'],
    ['task-0', 'raprino bli qua wo zen quasazen kewosti turfebli'],
    ['7f3c9e2a-1b4d-4c8e-9a6f-2d5e8b1c0f37', 'umtha dorzen nye oswo bliwoke blife rador quatha do'],
    ['é✓', 'thawo ke nyetha umno ranye velk'],
  ])('matches the pinned vector for %s', (id, expected) => {
    expect(nonsenseFor(id)).toBe(expected);
  });
});
