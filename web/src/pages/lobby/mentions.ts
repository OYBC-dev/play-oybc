const WORD = /[\p{L}\p{N}]/u;
const isWord = (ch: string | undefined): boolean => ch !== undefined && WORD.test(ch);
const isJoiner = (ch: string | undefined): boolean => ch === '-' || ch === "'" || ch === '’';

/** The `@partial` being typed right before the caret, or null. `start` is the index of the `@`. */
export function activeMention(text: string, caret: number): { start: number; partial: string } | null {
  const before = text.slice(0, caret);
  const m = /@([\p{L}\p{N}'’-]*)$/u.exec(before);
  if (!m) return null;
  const start = m.index;
  if (isWord(before[start - 1])) return null;
  return { start, partial: m[1] };
}

/** Names offered for a partial mention: other players (prefix, case-insensitive), then someone / anyone. */
export function mentionOptions(partial: string, seatNames: readonly string[]): string[] {
  const p = partial.toLowerCase();
  const names = seatNames.filter((n) => n.toLowerCase().startsWith(p));
  const specials = ['someone', 'anyone'].filter((n) => n.startsWith(p));
  return [...names, ...specials];
}

/**
 * First `@token` in `text` that matches no player name, `someone` or `anyone`,
 * written as the user typed it (e.g. `@Bob`). Null when every mention resolves.
 */
export function findUnknownMention(text: string, seatNames: readonly string[]): string | null {
  const keys = ['someone', 'anyone', ...seatNames.map((n) => n.trim().toLowerCase())];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '@' || isWord(text[i - 1]) || !isWord(text[i + 1])) continue;
    const rest = text.slice(i + 1).toLowerCase();
    const hit = keys.find((k) => rest.startsWith(k) && !isWord(rest[k.length]));
    if (hit) { i += hit.length; continue; }
    let stop = i + 1;
    while (isWord(text[stop]) || isJoiner(text[stop])) stop++;
    return text.slice(i, stop);
  }
  return null;
}
