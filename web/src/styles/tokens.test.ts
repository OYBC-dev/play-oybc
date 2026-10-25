/// <reference types="node" />
import { readFileSync } from 'node:fs';

// Read as text: Vitest's CSS pipeline does not hand stylesheet source to `?raw` imports.
const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const risoCss = read('./riso.css');
const buttonCss = read('../components/riso/RisoButton.module.css');

/** The `--name` value declared inside the first block whose selector is exactly `selector`. */
function token(css: string, selector: string, name: string): string {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf('}', start));
  const m = new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(block);
  if (start < 0 || !m) throw new Error(`${name} missing in ${selector}`);
  return m[1];
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT = "[data-pt='harvest']";
const DARK = "[data-pt='harvest'][data-theme='dark']";

describe('--riso-red-text', () => {
  it.each([LIGHT, DARK])('reads at >= 4.5:1 on paper and paper-2 (%s)', (theme) => {
    const red = token(risoCss, theme, '--riso-red-text');
    expect(contrast(red, token(risoCss, theme, '--riso-paper'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(red, token(risoCss, theme, '--riso-paper-2'))).toBeGreaterThanOrEqual(4.5);
  });

  it('is the fill red in light and the iOS RisoDanger lift in dark', () => {
    expect(token(risoCss, LIGHT, '--riso-red-text')).toBe(token(risoCss, LIGHT, '--riso-red'));
    expect(token(risoCss, DARK, '--riso-red-text').toLowerCase()).toBe('#c27d5f');
  });
});

describe('RisoButton small hit area', () => {
  it('outsets a transparent 6px target around the small size (iOS risoHitSlop(6))', () => {
    expect(buttonCss).toMatch(/\.btn \{[^}]*position: relative;/);
    expect(buttonCss).toMatch(/\.small::before \{[^}]*content: '';[^}]*position: absolute;[^}]*inset: -6px;/);
  });
});
