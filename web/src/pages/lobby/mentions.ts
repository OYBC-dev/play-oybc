const WORD = /[\p{L}\p{N}]/u;
const isWord = (ch: string | undefined): boolean => ch !== undefined && WORD.test(ch);

/** The `@partial` being typed right before the caret, or null. `start` is the index of the `@`. */
export function activeMention(text: string, caret: number): { start: number; partial: string } | null {
  const before = text.slice(0, caret);
  const m = /@([\p{L}\p{N}'’ -]*)$/u.exec(before);
  if (!m) return null;
  const start = m.index;
  if (isWord(before[start - 1])) return null;
  const partial = m[1].replace(/\s+/g, ' ');
  if (/^\s/.test(partial)) return null;
  return { start, partial };
}

/** Names offered for a partial mention: other players (prefix, case-insensitive), then someone / anyone. */
export function mentionOptions(partial: string, seatNames: readonly string[]): string[] {
  const p = partial.toLowerCase();
  const names = seatNames.filter((n) => n.toLowerCase().startsWith(p));
  const specials = ['someone', 'anyone'].filter((n) => n.startsWith(p));
  return [...names, ...specials];
}

