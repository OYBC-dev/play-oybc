const NAME_RE = /^[\p{L}\p{N} '’-]+$/u;
const RESERVED = new Set(['someone', 'anyone']);

function squash(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
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

/** Case- and whitespace-insensitive key for uniqueness checks and mention matching. */
export function nameKey(name: string): string {
  return squash(name).toLowerCase();
}
