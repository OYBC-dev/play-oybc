import { describe, expect, it } from 'vitest';
import { errorMessage } from './errorMessages';

describe('errorMessage', () => {
  it('says the player was replaced when listeners are permission-denied', () => {
    expect(errorMessage(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })))
      .toBe("You've been replaced in this game.");
  });
  it('maps app error codes and falls back otherwise', () => {
    expect(errorMessage({ details: { code: 'game-ended' } })).toBe('That game has ended');
    expect(errorMessage(new Error('boom'))).toBe('Something went wrong');
  });
});
