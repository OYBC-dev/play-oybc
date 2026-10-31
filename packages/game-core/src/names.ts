const NAME_RE = /^[\p{L}\p{N} '’-]+$/u;
const RESERVED = new Set(['someone', 'anyone']);

function squash(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/** Curly apostrophes (what the iOS keyboard types) read as the plain one. */
export function foldApostrophes(raw: string): string {
  return raw.replace(/[’‘]/g, "'");
}

/**
 * Normalizes a display name: trimmed, whitespace collapsed, 1-20 chars of
 * letters/digits/space/apostrophe/hyphen. Returns null when invalid or when
 * the name is a mention keyword ("someone" / "anyone").
 */
export function normalizeName(raw: string): string | null {
  const name = squash(raw);
  if (name.length < 1 || name.length > 20) return null;
  if (!NAME_RE.test(name)) return null;
  if (RESERVED.has(name.toLowerCase())) return null;
  return name;
}

/** Case-, whitespace- and apostrophe-insensitive key for uniqueness checks and mention matching. */
export function nameKey(name: string): string {
  return foldApostrophes(squash(name)).toLowerCase();
}

/** The first word of a name key ("cody b" → "cody"). */
export function firstWord(key: string): string {
  return key.split(' ')[0];
}

/**
 * Whether an unbound name key plausibly names the seat with `seatKey`: the same
 * key, the seat's first name, a 3+ char prefix of it, or that first name plus an
 * "s", so "@Cody", "@Cod" and "@Codys" all reach "Cody B" while "@Samantha" does
 * not reach "Sam". Used to keep a task from a seat the text nearly names and to
 * refuse such a mention while that seat is here.
 */
export function isNearName(key: string, seatKey: string): boolean {
  if (key === seatKey) return true;
  const first = firstWord(seatKey);
  if (key === first || key === first + 's') return true;
  return key.length >= 3 && first.startsWith(key);
}

/**
 * Key for spotting a task already in the pool: trimmed, whitespace collapsed,
 * curly apostrophes folded, lower-cased, and trailing `.`, `!`, `?` dropped, so
 * "Someone spills a drink!" and " someone  spills a drink" are the same task.
 */
export function taskTextKey(text: string): string {
  return foldApostrophes(squash(text)).toLowerCase().replace(/[.!?]+$/u, '').trimEnd();
}
