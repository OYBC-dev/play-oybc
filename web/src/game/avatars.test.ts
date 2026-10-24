import { describe, expect, it } from 'vitest';
import { avatarFor } from './avatars';

describe('avatarFor', () => {
  it('single word gives one letter, uppercased', () => {
    expect(avatarFor({ name: 'maya' }, 0).initials).toBe('M');
  });
  it('several words still give one letter, from the first word', () => {
    expect(avatarFor({ name: 'ada lovelace' }, 0).initials).toBe('A');
    expect(avatarFor({ name: '  ada  byron lovelace' }, 0).initials).toBe('A');
  });
  it('blank gives ?', () => {
    expect(avatarFor({ name: '   ' }, 0).initials).toBe('?');
    expect(avatarFor({ name: '' }, 0).initials).toBe('?');
  });
  it('does not split emoji', () => {
    expect(avatarFor({ name: '🎉 party' }, 0).initials).toBe('🎉');
  });
  it('cycles fills red, blue, gold, green, paper-2 and wraps', () => {
    const fills = [0, 1, 2, 3, 4, 5].map((i) => avatarFor({ name: 'x' }, i).fill);
    expect(fills).toEqual([
      'var(--riso-red)', 'var(--riso-blue)', 'var(--riso-gold)',
      'var(--riso-green)', 'var(--riso-paper-2)', 'var(--riso-red)',
    ]);
  });
  it('picks text colours per fill', () => {
    expect(avatarFor({ name: 'x' }, 0).color).toBe('var(--riso-on-color)');
    expect(avatarFor({ name: 'x' }, 2).color).toBe('var(--riso-ink-static)');
    expect(avatarFor({ name: 'x' }, 4).color).toBe('var(--riso-ink)');
  });
});
