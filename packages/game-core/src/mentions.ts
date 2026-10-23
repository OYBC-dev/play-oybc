import { nameKey } from './names';
import { Seat, TaskMentions } from './types';

export type ParseMentionsResult =
  | { ok: true; mentions: TaskMentions }
  | { ok: false; error: 'unknown-mention'; token: string };

const isWordChar = (ch: string | undefined): boolean => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

/**
 * Parses @mentions: `@someone`, `@anyone`, or the longest matching seat name
 * (case-insensitive). An `@` preceded by a letter/digit is ignored.
 */
export function parseMentions(text: string, seats: readonly Seat[]): ParseMentionsResult {
  const lower = text.toLowerCase();
  const byLength = [...seats]
    .map((s) => ({ seatId: s.seatId, key: nameKey(s.name) }))
    .sort((a, b) => b.key.length - a.key.length);
  const seatIds: string[] = [];
  let someone = false;
  let anyone = false;

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '@' || isWordChar(text[i - 1])) continue;
    const start = i + 1;
    const matchesAt = (word: string): boolean =>
      lower.startsWith(word, start) && !isWordChar(text[start + word.length]);

    if (matchesAt('someone')) { someone = true; i = start + 6; continue; }
    if (matchesAt('anyone')) { anyone = true; i = start + 5; continue; }
    const hit = byLength.find((s) => matchesAt(s.key));
    if (hit) {
      if (!seatIds.includes(hit.seatId)) seatIds.push(hit.seatId);
      i = start + hit.key.length - 1;
      continue;
    }
    let end = start;
    while (isWordChar(text[end])) end++;
    return { ok: false, error: 'unknown-mention', token: '@' + text.slice(start, end) };
  }
  return { ok: true, mentions: { seatIds, someone, anyone } };
}
