import { scanMentions } from './mentions';
import { nameKey } from './names';
import { NameStates, PoolTask, RosterName, Seat } from './types';

/**
 * The names the pool refers to that no seat carries as its own name, in order
 * of first mention (task `createdAt`, then text order), each with the host's
 * binding when that seat is here. A name someone joined under exactly is not a
 * row (it resolves implicitly), and neither is a retired one. `display` is the
 * name as first typed.
 *
 * @param names the host's name states; a binding whose seat has gone reads as unbound
 */
export function buildRoster(tasks: readonly PoolTask[], seats: readonly Seat[], names: NameStates): RosterName[] {
  const seatIds = new Set(seats.map((s) => s.seatId));
  const rows = new Map<string, RosterName>();
  for (const task of [...tasks].sort((a, b) => a.createdAt - b.createdAt)) {
    for (const t of scanMentions(task.text, seats)) {
      if (t.kind !== 'unknown') continue;
      const display = t.token.slice(1);
      const key = nameKey(display);
      if (rows.has(key)) continue;
      const state = names.get(key);
      if (state?.retired) continue;
      const bound = state?.seatId ?? null;
      rows.set(key, { key, display, seatId: bound !== null && seatIds.has(bound) ? bound : null });
    }
  }
  return [...rows.values()];
}

/** The roster's unbound keys: what a launch releases (marks retired) before dealing. */
export function unboundKeys(tasks: readonly PoolTask[], seats: readonly Seat[], names: NameStates): string[] {
  return buildRoster(tasks, seats, names).filter((r) => r.seatId === null).map((r) => r.key);
}

/** Whether `key` is a name the roster lists (something a binding may point at). */
export function rosterHas(roster: readonly RosterName[], key: string): boolean {
  return roster.some((r) => r.key === key);
}

