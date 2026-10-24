/** Avatar presentation for a lobby seat. */
export interface AvatarStyle {
  /** One uppercase letter; "?" when the name is blank. */
  initials: string;
  /** CSS colour expression for the circle fill (a `--riso-*` token). */
  fill: string;
  /** CSS colour expression for the initials. */
  color: string;
}

const CYCLE = [
  { fill: 'var(--riso-red)', color: 'var(--riso-on-color)' },
  { fill: 'var(--riso-blue)', color: 'var(--riso-on-color)' },
  { fill: 'var(--riso-gold)', color: 'var(--riso-ink-static)' },
  { fill: 'var(--riso-green)', color: 'var(--riso-on-color)' },
  { fill: 'var(--riso-paper-2)', color: 'var(--riso-ink)' },
] as const;

/**
 * Derive a seat's avatar.
 *
 * Rule (mirrored in Swift, keep it simple): `index` is the seat's join-order
 * position (0-based); the fill cycles red, blue, gold, green, paper-2 by
 * `index % 5`. The initial is the first letter of the first
 * whitespace-separated word of the name, uppercased; an empty or
 * whitespace-only name gives "?". The letter is taken by code point so emoji
 * are not split.
 *
 * @param seat Anything with a `name`.
 * @param index Join-order index of the seat.
 * @returns initials plus fill and text colour tokens.
 */
export function avatarFor(seat: { name: string }, index: number): AvatarStyle {
  const first = seat.name.trim().split(/\s+/)[0] ?? '';
  const initials = first ? Array.from(first)[0]!.toUpperCase() : '?';
  const slot = CYCLE[((index % CYCLE.length) + CYCLE.length) % CYCLE.length]!;
  return { initials, fill: slot.fill, color: slot.color };
}
