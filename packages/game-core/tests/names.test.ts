import { isNearName, nameKey, normalizeName } from '../src/names';

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
  it('nameKey folds curly apostrophes', () => {
    expect(nameKey('O’Neil')).toBe("o'neil");
    expect(nameKey("O'Neil")).toBe(nameKey('O‘Neil'));
  });
  it('isNearName: same key, first name, 3+ char prefix either way; never a short or unrelated key', () => {
    expect(isNearName('cody', 'cody b')).toBe(true);
    expect(isNearName('cod', 'cody b')).toBe(true);
    expect(isNearName('codys', 'cody b')).toBe(true);
    expect(isNearName('mary', 'mary jane')).toBe(true);
    expect(isNearName('jo', 'josh')).toBe(false);
    expect(isNearName('jo-ann', 'jo')).toBe(false);
    expect(isNearName('mike', 'michael')).toBe(false);
    expect(isNearName('seth', 'cody b')).toBe(false);
  });
});
