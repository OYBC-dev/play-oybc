import { normalizeName, nameKey } from '../src/names';

describe('names', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeName('  Mary   Jane ')).toBe('Mary Jane');
  });
  it('rejects empty, too long, and bad characters', () => {
    expect(normalizeName('')).toBeNull();
    expect(normalizeName('   ')).toBeNull();
    expect(normalizeName('x'.repeat(21))).toBeNull();
    expect(normalizeName('x'.repeat(20))).toBe('x'.repeat(20));
    expect(normalizeName('Cody<script>')).toBeNull();
  });
  it('allows apostrophes, hyphens, unicode letters and digits', () => {
    expect(normalizeName("O'Brien-Smith")).toBe("O'Brien-Smith");
    expect(normalizeName('O’Neil')).toBe('O’Neil');
    expect(normalizeName('José 2')).toBe('José 2');
  });
  it('rejects mention keywords in any case', () => {
    expect(normalizeName('someone')).toBeNull();
    expect(normalizeName(' ANYONE ')).toBeNull();
    expect(normalizeName('Someone Else')).toBe('Someone Else');
  });
  it('nameKey is case- and whitespace-insensitive', () => {
    expect(nameKey(' CODY ')).toBe(nameKey('cody'));
    expect(nameKey('Mary   Jane')).toBe('mary jane');
  });
});
