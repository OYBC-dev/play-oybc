import { describe, expect, it } from 'vitest';
import { errorMessage } from './errorMessages';

describe('errorMessage', () => {
  it('maps app error codes and falls back otherwise', () => {
    expect(errorMessage({ details: { code: 'game-ended' } })).toBe('That game has ended');
    expect(errorMessage(new Error('boom'))).toBe('Something went wrong');
  });
});

describe('errorMessage permission-denied', () => {
  it('is not mapped globally', () => {
    expect(errorMessage(Object.assign(new Error('x'), { code: 'permission-denied' }))).toBe('Something went wrong');
  });
});
