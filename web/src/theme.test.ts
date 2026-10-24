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
    applyTheme(document, mq);
    expect(document.documentElement.getAttribute('data-pt')).toBe('harvest');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
  it('starts dark and flips on change', () => {
    const mq = fakeMq(true);
    const off = applyTheme(document, mq);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    mq.fire(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    off();
    expect(mq.active()).toBe(false);
  });

  it('falls back to light when matchMedia is missing', () => {
    document.documentElement.removeAttribute('data-theme');
    expect(() => applyTheme(document, undefined)()).not.toThrow();
    expect(document.documentElement.getAttribute('data-pt')).toBe('harvest');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
  it('uses addListener/removeListener on old Safari', () => {
    let cb: ((e: { matches: boolean }) => void) | null = null;
    let removed = false;
    const mq = {
      matches: true,
      addListener: (f: (e: { matches: boolean }) => void) => { cb = f; },
      removeListener: () => { removed = true; },
    };
    const off = applyTheme(document, mq);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    cb!({ matches: false });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    off();
    expect(removed).toBe(true);
  });
});
