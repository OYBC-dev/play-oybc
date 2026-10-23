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

/**
 * Parses @mentions: `@someone`, `@anyone`, or the longest matching seat name
 * (case- and whitespace-insensitive). An `@` preceded by a letter/digit, or
 * not followed by a letter/digit, is plain text.
 */
export function parseMentions(text: string, seats: readonly Seat[]): ParseMentionsResult {
  const byLength = seats
    .map((s) => ({ seatId: s.seatId, key: nameKey(s.name) }))
    .sort((a, b) => b.key.length - a.key.length);
  const seatIds: string[] = [];
  let someone = false;
  let anyone = false;

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '@' || isWordChar(text[i - 1]) || !isWordChar(text[i + 1])) continue;
    const start = i + 1;
    const tryKey = (key: string): number => {
      const end = matchKey(text, start, key);
      return end >= 0 && endsCleanly(text, end) ? end : -1;
    };

    let end = tryKey('someone');
    if (end >= 0) { someone = true; i = end - 1; continue; }
    end = tryKey('anyone');
    if (end >= 0) { anyone = true; i = end - 1; continue; }
    let matched = false;
    for (const s of byLength) {
      end = tryKey(s.key);
      if (end >= 0) {
        if (!seatIds.includes(s.seatId)) seatIds.push(s.seatId);
        i = end - 1;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    let stop = start;
    while (isWordChar(text[stop]) || isJoiner(text[stop])) stop++;
    return { ok: false, error: 'unknown-mention', token: '@' + text.slice(start, stop) };
  }
  return { ok: true, mentions: { seatIds, someone, anyone } };
}
