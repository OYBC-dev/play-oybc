import { GAME_CODE_LENGTH } from './constants';

/** Unambiguous code alphabet (no I, L, O, 0, 1). */
export const GAME_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Generates a 5-character join code. Collision checks are the caller's job. */
export function generateGameCode(rng: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < GAME_CODE_LENGTH; i++) {
    code += GAME_CODE_ALPHABET[Math.floor(rng() * GAME_CODE_ALPHABET.length)];
  }
  return code;
}
