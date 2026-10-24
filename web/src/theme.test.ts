import { describe, expect, it } from 'vitest';
import { applyTheme } from './theme';

function fakeMq(matches: boolean) {
  let cb: ((e: { matches: boolean }) => void) | null = null;
  return {
    matches,
    addEventListener: (_: string, f: (e: { matches: boolean }) => void) => { cb = f; },
    removeEventListener: () => { cb = null; },
    fire: (m: boolean) => cb?.({ matches: m }),
    active: () => cb !== null,
  };
}

describe('applyTheme', () => {
  it('sets harvest and light by default', () => {
    const mq = fakeMq(false);
    applyTheme(document, mq as never);
    expect(document.documentElement.getAttribute('data-pt')).toBe('harvest');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
  it('starts dark and flips on change', () => {
    const mq = fakeMq(true);
    const off = applyTheme(document, mq as never);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    mq.fire(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    off();
    expect(mq.active()).toBe(false);
  });
});
