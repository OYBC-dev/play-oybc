import { scanMentions } from './mentions';
import { nameKey } from './names';
import { NameBindings, PoolTask, RosterName, Seat } from './types';

/**
 * The names the pool refers to that no seat carries as its own name, in order
 * of first mention (task `createdAt`, then text order), each with the host's
 * binding when that seat is here. A name someone joined under exactly is not a
 * row: it resolves implicitly. `display` is the name as first typed.
 *
 * @param bindings the host's bindings; one whose seat has gone reads as unbound
 */
export function buildRoster(tasks: readonly PoolTask[], seats: readonly Seat[], bindings: NameBindings): RosterName[] {
  const seatIds = new Set(seats.map((s) => s.seatId));
  const rows = new Map<string, RosterName>();
  for (const task of [...tasks].sort((a, b) => a.createdAt - b.createdAt)) {
    for (const t of scanMentions(task.text, seats)) {
      if (t.kind !== 'unknown') continue;
      const display = t.token.slice(1);
      const key = nameKey(display);
      if (rows.has(key)) continue;
      const bound = bindings.get(key);
      rows.set(key, { key, display, seatId: bound !== undefined && seatIds.has(bound) ? bound : null });
    }
  }
  return [...rows.values()];
}

/** Whether `key` is a name the roster lists (something a binding may point at). */
export function rosterHas(roster: readonly RosterName[], key: string): boolean {
  return roster.some((r) => r.key === key);
}

/**
 * Retires a name from one task's text: every `@word` whose key is `key` loses
 * its `@` (`@Jess` → `Jess`), so it no longer scans as a mention. Whole tokens
 * only: `@Jessica` and `@Jess's` keep their own boundaries (`@Jess's` → `Jess's`).
 *
 * @returns the rewritten text (the same string when nothing matched)
 */
export function retireNameInText(text: string, key: string, seats: readonly Seat[]): string {
  let out = '';
  let last = 0;
  for (const t of scanMentions(text, seats)) {
    if (t.kind !== 'unknown' || nameKey(t.token.slice(1)) !== key) continue;
    out += text.slice(last, t.start);
    last = t.start + 1;
  }
  return out + text.slice(last);
}
