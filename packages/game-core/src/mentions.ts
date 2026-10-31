import { nameKey } from './names';
import { Seat, TaskMentions } from './types';

export type ParseMentionsResult =
  | { ok: true; mentions: TaskMentions }
  | { ok: false; error: 'unknown-mention'; token: string };

const isWordChar = (ch: string | undefined): boolean => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
const isJoiner = (ch: string | undefined): boolean => ch === '-' || ch === "'" || ch === '’';
const isSpace = (ch: string | undefined): boolean => ch !== undefined && /\s/u.test(ch);

/**
 * Matches `key` (lower-case, single-spaced) at `start`, treating any run of
 * whitespace in the text as one space. Returns the end index or -1.
 */
function matchKey(text: string, start: number, key: string): number {
  let t = start;
  for (const ch of key) {
    if (ch === ' ') {
      if (!isSpace(text[t])) return -1;
      while (isSpace(text[t])) t++;
    } else {
      if (t >= text.length || text[t].toLowerCase() !== ch) return -1;
      t++;
    }
  }
  return t;
}

/** True when a match ending at `end` is a whole token (not a prefix of a longer name). */
function endsCleanly(text: string, end: number): boolean {
  const next = text[end];
  if (isWordChar(next)) return false;
  if (isJoiner(next) && isWordChar(text[end + 1])) {
    const possessive = next !== '-' && text[end + 1].toLowerCase() === 's' && !isWordChar(text[end + 2]);
    return possessive;
  }
  return true;
}

/** One `@` token found in task text, with its [start, end) span (start is the `@`). */
export type MentionToken =
  | { kind: 'someone'; start: number; end: number }
  | { kind: 'anyone'; start: number; end: number }
  | { kind: 'seat'; seat: Seat; start: number; end: number }
  | { kind: 'unknown'; start: number; end: number; token: string };

/**
 * Scans `text` for @mention tokens: `@someone`, `@anyone`, or a seat name
 * (case- and whitespace-insensitive). The longest match at a position wins, so a
 * seat named "Someone Else" beats the `someone` keyword; on an equal-length tie
 * the keyword wins. An `@` preceded by a
 * letter/digit, or not followed by a letter/digit, is plain text. Every other
 * `@word` is an `unknown` token spanning the word.
 */
export function scanMentions(text: string, seats: readonly Seat[]): MentionToken[] {
  const byLength = seats
    .map((seat) => ({ seat, key: nameKey(seat.name) }))
    .sort((a, b) => b.key.length - a.key.length);
  const tokens: MentionToken[] = [];

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '@' || isWordChar(text[i - 1]) || !isWordChar(text[i + 1])) continue;
    const start = i + 1;
    const tryKey = (key: string): number => {
      const end = matchKey(text, start, key);
      return end >= 0 && endsCleanly(text, end) ? end : -1;
    };

    // Longest match at this position wins; keywords are offered first so they win ties.
    const candidates: MentionToken[] = [];
    let end = tryKey('someone');
    if (end >= 0) candidates.push({ kind: 'someone', start: i, end });
    if ((end = tryKey('anyone')) >= 0) candidates.push({ kind: 'anyone', start: i, end });
    const seatMatch = byLength.find((s) => (end = tryKey(s.key)) >= 0);
    if (seatMatch) candidates.push({ kind: 'seat', seat: seatMatch.seat, start: i, end });
    let token: MentionToken | null = null;
    for (const c of candidates) if (!token || c.end > token.end) token = c;
    if (!token) {
      let stop = start;
      while (isWordChar(text[stop]) || isJoiner(text[stop])) stop++;
      token = { kind: 'unknown', start: i, end: stop, token: '@' + text.slice(start, stop) };
    }
    tokens.push(token);
    i = token.end - 1;
  }
  return tokens;
}

/**
 * Parses @mentions (token rules in {@link scanMentions}). Fails on the first
 * `@word` that is neither a keyword nor a seat name.
 */
export function parseMentions(text: string, seats: readonly Seat[]): ParseMentionsResult {
  const seatIds: string[] = [];
  let someone = false;
  let anyone = false;
  for (const t of scanMentions(text, seats)) {
    if (t.kind === 'unknown') return { ok: false, error: 'unknown-mention', token: t.token };
    if (t.kind === 'someone') someone = true;
    else if (t.kind === 'anyone') anyone = true;
    else if (!seatIds.includes(t.seat.seatId)) seatIds.push(t.seat.seatId);
  }
  return { ok: true, mentions: { seatIds, someone, anyone } };
}

/** Rewrites each token for which `render` returns a string; other text is untouched. */
function rewriteMentions(
  text: string,
  seats: readonly Seat[],
  render: (t: MentionToken) => string | null,
): string {
  let out = '';
  let last = 0;
  for (const t of scanMentions(text, seats)) {
    const value = render(t);
    if (value === null) continue;
    out += text.slice(last, t.start) + value;
    last = t.end;
  }
  return out + text.slice(last);
}

/**
 * Replaces every `@someone` token (same boundary rules as {@link parseMentions})
 * with `replacement`. Other text, `@anyone` and seat mentions are untouched.
 */
export function replaceSomeone(text: string, replacement: string): string {
  return rewriteMentions(text, [], (t) => (t.kind === 'someone' ? replacement : null));
}

/**
 * Board display text: `@Name` becomes the seat's name as the seat wrote it
 * (longest seat-name match), `@anyone` becomes "Anyone", and `@someone`
 * becomes `someoneName` (left verbatim when null). Unknown `@word`s are kept.
 * Same as `resolveMentionRefs(...).text`.
 */
export function resolveMentionDisplay(
  text: string,
  seats: readonly Seat[],
  someoneName: string | null,
): string {
  return resolveMentionRefs(text, seats, someoneName).text;
}

/**
 * Display text plus where each resolved mention sits in it. Resolution is
 * {@link resolveMentionDisplay}'s: `@Name` → the seat's name, `@someone` →
 * `someoneName`, `@anyone` → "Anyone". Each resolved mention yields one
 * `[start, end)` ref in UTF-16 code units of the RESOLVED text. Unknown
 * `@word`s, and `@someone` when `someoneName` is null, stay verbatim with no ref.
 *
 * @param text raw task text
 * @param seats seats whose names `@Name` may match
 * @param someoneName the name `@someone` resolves to, or null to keep it
 * @returns `{ text, refs }`, refs in ascending order
 */
export function resolveMentionRefs(
  text: string,
  seats: readonly Seat[],
  someoneName: string | null,
): { text: string; refs: Array<[number, number]> } {
  const refs: Array<[number, number]> = [];
  let out = '';
  let last = 0;
  for (const t of scanMentions(text, seats)) {
    const value =
      t.kind === 'seat' ? t.seat.name : t.kind === 'anyone' ? 'Anyone' : t.kind === 'someone' ? someoneName : null;
    if (value === null) continue;
    out += text.slice(last, t.start);
    refs.push([out.length, out.length + value.length]);
    out += value;
    last = t.end;
  }
  return { text: out + text.slice(last), refs };
}
