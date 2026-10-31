import type { RosterName } from 'game-core';

/*
 * Name rules restated from game-core `names.ts` (the web bundle imports game-core for types only).
 * Keep these three in step with it.
 */
const NAME_RE = /^[\p{L}\p{N} '’-]+$/u;
const KEYWORDS = ['someone', 'anyone'];
const squash = (raw: string): string => raw.trim().replace(/\s+/g, ' ');

/** game-core `normalizeName`: the trimmed, collapsed name, or null when invalid or a keyword. */
export function normalizeName(raw: string): string | null {
  const name = squash(raw);
  if (name.length < 1 || name.length > 20 || !NAME_RE.test(name)) return null;
  return KEYWORDS.includes(name.toLowerCase()) ? null : name;
}

/** game-core `nameKey`: case-, whitespace- and apostrophe-insensitive. */
export function nameKey(name: string): string {
  return squash(name).replace(/[’‘]/g, "'").toLowerCase();
}

/** game-core `isNearName`: `key` is the seat's key, its first name (or + "s"), or a 3+ char prefix of the first name. */
export function isNearName(key: string, seatKey: string): boolean {
  if (key === seatKey) return true;
  const first = seatKey.split(' ')[0];
  if (key === first || key === first + 's') return true;
  return key.length >= 3 && first.startsWith(key);
}

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

/**
 * What a suggestion row is: a joined player, a roster name bound to a player, a roster name nobody has
 * yet, a keyword (`someone` / `anyone`), or a new name to add.
 */
export type MentionKind = 'player' | 'bound' | 'unbound' | 'keyword' | 'add';
/** One suggestion row; picking it inserts `@<name> `. */
export interface MentionOption { name: string; kind: MentionKind }

/**
 * Suggestions for a partial mention, in order: other players (prefix, case-insensitive), roster names
 * bound to a player, unbound roster names, `someone` / `anyone`, then one `add` row for the typed name
 * when it is one word, a valid name, matches no row above exactly, is not the start of anyone's name here (or of a keyword), and does
 * not nearly name anyone here (the server refuses that as `unknown-mention`).
 *
 * @param seats names of the other players (not you), in display order
 * @param roster the snapshot's roster
 * @param present every seated name, you included (for the add row's exact / near checks); defaults to `seats`
 */
export function mentionOptions(
  partial: string,
  seats: readonly string[],
  roster: readonly RosterName[] = [],
  present: readonly string[] = seats,
): MentionOption[] {
  const p = partial.toLowerCase();
  const starts = (n: string) => n.toLowerCase().startsWith(p);
  const rows: MentionOption[] = [
    ...seats.filter(starts).map((name) => ({ name, kind: 'player' as const })),
    ...roster.filter((r) => r.seatId !== null && starts(r.display)).map((r) => ({ name: r.display, kind: 'bound' as const })),
    ...roster.filter((r) => r.seatId === null && starts(r.display)).map((r) => ({ name: r.display, kind: 'unbound' as const })),
    ...KEYWORDS.filter(starts).map((name) => ({ name, kind: 'keyword' as const })),
  ];
  // One word only: past a space the person is typing the task, and a name just picked ends in one.
  const typed = /\s/.test(partial) ? null : normalizeName(partial);
  if (typed !== null) {
    const key = nameKey(typed);
    const taken = [...present, ...roster.map((r) => r.display), ...KEYWORDS].some((n) => nameKey(n) === key);
    // A prefix of someone here (or of a keyword) is them being typed; a near name is refused by the server.
    const near = [...present, ...KEYWORDS].some((n) => nameKey(n).startsWith(key))
      || present.some((n) => isNearName(key, nameKey(n)));
    if (!taken && !near) rows.push({ name: typed, kind: 'add' });
  }
  return rows;
}
