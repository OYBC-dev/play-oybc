/** Avatar presentation for a lobby seat. */
export interface AvatarStyle {
  /** One or two uppercase letters; "?" when the name is blank. */
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
 * `index % 5`. Initials are the first letter of each of the first two
 * whitespace-separated words of the name, uppercased (one word gives one
 * letter); an empty or whitespace-only name gives "?". Letters are taken by
 * code point so emoji are not split.
 *
 * @param seat Anything with a `name`.
 * @param index Join-order index of the seat.
 * @returns initials plus fill and text colour tokens.
 */
export function avatarFor(seat: { name: string }, index: number): AvatarStyle {
  const words = seat.name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const initials = words.length
    ? words.map((w) => Array.from(w)[0]!.toUpperCase()).join('')
    : '?';
  const slot = CYCLE[((index % CYCLE.length) + CYCLE.length) % CYCLE.length]!;
  return { initials, fill: slot.fill, color: slot.color };
}
