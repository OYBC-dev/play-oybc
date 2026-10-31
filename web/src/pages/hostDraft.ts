/**
 * What the host has typed between Home and Game settings, kept in memory so Back from Game settings
 * returns to Home with the name (and the settings) still there. Not persisted: a reload starts fresh.
 */
export interface HostDraft {
  /** The host's display name, as typed on Home. */
  name: string;
  /** The game's name, as typed on Game settings. */
  gameName: string;
  /** Free space, as set on Game settings (default off). */
  freeSpace: boolean;
}

const EMPTY: HostDraft = { name: '', gameName: '', freeSpace: false };
let draft: HostDraft = { ...EMPTY };

/** The current draft. */
export function hostDraft(): HostDraft {
  return draft;
}

/** Merges `patch` into the draft. */
export function updateHostDraft(patch: Partial<HostDraft>): void {
  draft = { ...draft, ...patch };
}

/** Forgets the draft (after the game is created). */
export function clearHostDraft(): void {
  draft = { ...EMPTY };
}

/** Mirrors `MAX_GAME_NAME_LENGTH` in game-core (types-only import on web, so the value is duplicated). */
export const MAX_GAME_NAME_LENGTH = 40;

/** Tasks each board needs: 24 with a free centre, else 25 (mirrors the server's derivation). */
export function tasksPerBoardFor(freeSpace: boolean): number {
  return freeSpace ? 24 : 25;
}

const NAME_RE = /^[\p{L}\p{N} '’-]+$/u;
const RESERVED = new Set(['someone', 'anyone']);

/**
 * Whether the server will take `raw` as a display name. Mirrors game-core's `normalizeName` (types-only
 * import on web): trimmed and squashed, 1–20 letters, digits, spaces, apostrophes or hyphens, and not a
 * mention keyword. The server stays the authority; this only stops Home sending a name it would refuse.
 *
 * @param raw The name as typed.
 * @returns true when the name is acceptable.
 */
export function isValidHostName(raw: string): boolean {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 20) return false;
  if (!NAME_RE.test(name)) return false;
  return !RESERVED.has(name.toLowerCase());
}
