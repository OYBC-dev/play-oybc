import { generateGameCode, GAME_CODE_ALPHABET } from '../src/gameCode';
import { makeSeededRng } from './seededRng';

describe('generateGameCode', () => {
  it('is 5 chars from the alphabet and deterministic when seeded', () => {
    const c = generateGameCode(makeSeededRng(7));
    expect(c).toHaveLength(5);
    for (const ch of c) expect(GAME_CODE_ALPHABET).toContain(ch);
    expect(generateGameCode(makeSeededRng(7))).toBe(c);
  });
  it('works with the default rng', () => {
    expect(generateGameCode()).toHaveLength(5);
  });
});
