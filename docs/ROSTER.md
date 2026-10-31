# Roster: mention people before they join

Status: design agreed with the owner 2026-10-31 (the night before the first party); builds after the party. Supersedes the "a mention must name a current player" rule in `docs/DESIGN.md` §4.3 and the "late joiners can't be `@Name`d" line in §4.4. Everything in `docs/PARTY_FEATURES.md` stays as is; this doc changes only how a task's mentions are stored and resolved.

## 1. Intent

Today a task's `@Name` must match a player who is already in the lobby, or the add fails with "No one here goes by that name". People write tasks about friends who arrive hours later, and some friends join under a nickname. Both block a task that should exist.

The fix: a game keeps a **roster** of names. A task references roster names, not seats. A name is **bound** to a player (one seat) or **unbound** (nobody yet). Anyone can add a name by mentioning it; only the host binds, rebinds or retires names. Everything that asks "who does this task reference" resolves the name through the roster at read time, so a task written at 7 pm about Jess becomes Jess's task the moment Jess joins at 10 pm.

Goals: a mention never blocks an add; a player who turns out to be the referenced person never saw the task; the host can fix any name/player mismatch in two taps. Non-goals: editing task text; mentioning someone who never joins and still dealing that task to them (impossible by definition); changing `@someone` / `@anyone`.

## 2. Model

`packages/game-core/src/types.ts`:

```ts
/** A name people reference in tasks; bound to a seat once that person is in the game. */
export interface RosterName { key: string; display: string; seatId: string | null; createdAt: number }
export interface TaskMentions { names: string[]; someone: boolean; anyone: boolean }   // names = roster keys
```

- `key` is `nameKey(display)` (the existing squash + lowercase), unique within a game. `display` is the name as first typed, trimmed and single-spaced.
- Many names may bind to one seat (nicknames); a name binds to at most one seat.
- The roster is part of game state (server table `roster`), sent to every client in a new `roster` section (`Array<RosterName>`), pushed with `seats` whenever it changes.
- `mentions.seatIds` is gone. The server stores `names`. Legacy rows do not exist (no game spans the deploy; purge handles ended rooms).

### Resolution helpers (pure, game-core)

- `boundSeat(roster, key): string | null`.
- `isIdentified(roster, seatId): boolean` — the seat has at least one bound name.
- `mentionedSeats(task, roster): string[]` — the seats bound to the task's names.
- `hasUnboundName(task, roster): boolean`.

## 3. Rules

### 3.1 Authoring

`parseMentions(text, roster, seats)` scans `@` tokens as today. A token that matches a roster name (by key) or a seat name (by key) resolves to that roster key, creating the roster entry when only a seat matched (every joined player's own name is implicitly a roster name bound to their seat; the server materialises it on join). A token that matches nothing is **not an error**: it is a new unbound roster name. `self-mention` stays an error (a player cannot reference their own bound name).

The client autocomplete (`web/src/pages/lobby/mentions.ts` ↔ `ios/PlayOYBC/Game/Mentions.swift`) lists, for a partial: bound names, then unbound names, then `someone` / `anyone`, then, when the partial matches none of them exactly, a final row that adds the typed name (`+ Jess`). Picking it inserts `@Jess ` and the add proceeds; the server creates the roster entry on `addTask`.

### 3.2 Binding

- **Auto-bind on join.** `join` with a name whose key equals an unbound roster name binds it to the new seat. (A key that equals a seat's name is the existing reclaim path and is unchanged.) A joined player's own name is always a roster entry bound to them, so the roster is the single source for "who is here".
- **Host bind.** `bindName { key, seatId }` (host only, any stage): points the name at that seat. `seatId: null` unbinds. A name may be re-pointed at any time.
- **Host retire.** `retireName { key }` (host only, any stage): removes the name. Every task mentioning it drops that key; its text keeps the word as plain text. A seat's own name cannot be retired while the seat exists.
- **Rename on reclaim / transfer:** seats keep their names; nothing changes.

### 3.3 Visibility (pool)

For viewer seat V and task T (author sees everything, as today):

1. `someone` / `anyone` tasks: author only (unchanged).
2. If T mentions a name bound to V: hidden.
3. If T mentions any **unbound** name and V is **not identified** (`isIdentified(roster, V)` is false): hidden — V might be that person.
4. Otherwise visible.

Hidden rows use the existing blurred treatment. A viewer's pool re-renders on every roster change (the server pushes `view` to all whenever the roster changes, including auto-bind on join).

### 3.4 Dealing and readiness

`canBeDealt(task, seatId, roster)` is false when rule 2 or rule 3 above would hide the task from that seat. `dealableCounts` / `shortfalls` / `dealBoard` / the late-join deal all take the roster and apply the same predicate, so an unidentified player's count excludes unbound-name tasks and the lobby's shortfall lines show it ("Pat needs 2 more tasks"). The `@anyone` assignment and the free-space rules are unchanged.

Binding after launch never re-deals. A task already on a board stays there even if its name later binds to that board's owner (the host sees both chips and can act before launch; after launch it is a known, accepted edge).

### 3.5 Display

Board cells and pool rows resolve a mention to the **bound player's seat name** when bound, else the roster `display`; the `refs` ranges and bold rendering from `docs/PARTY_FEATURES.md` apply unchanged. `resolveMentionRefs(text, roster, seats, someoneName)` replaces the seats-only signature.

## 4. Server

- State: `roster` table `(key TEXT PRIMARY KEY, display TEXT NOT NULL, seatId TEXT NULL, createdAt INTEGER NOT NULL)`; `tasks.mentions` JSON stores `names`.
- Ops: `addTask` creates missing roster names; `join` auto-binds and creates the seat's own name; `bindName`, `retireName` (host only; `not-host`, `name-not-found`, `seat-not-found`, `invalid-argument`); every roster change pushes `all: ['roster', 'view', 'game']` (`game` because `shortfalls` / `dealable` move).
- Sections: new `roster`; `view` and `board` built through the roster. `Section`, `StateMsg`, `ALL_SECTIONS`, the hello replay, and both clients' section merges gain `roster` (defaulted `[]`).
- Limits: roster names capped at 100 per game (`resource-exhausted` beyond); name validation = the join name rules (`invalid-name`).

## 5. Clients (web and iOS, same behaviour)

- **Autocomplete**: bound names, unbound names (dashed glyph before the name), `someone`, `anyone`, then `+ <typed name>` when nothing matches exactly. The `unknown-mention` error path and its copy are removed.
- **Lobby avatar stack / chip list**: joined players as today; unbound names as dashed chips after them, host-tappable. A bound name that differs from the seat name shows under that player's chip as a small tag (e.g. chip "C-Dog", tag "Cody").
- **Bind sheet** (host taps a dashed chip or a name tag): title is the name (`Jess`), a radio list of joined players, `Nobody yet` (unbind), and a quiet red `Not coming` (retire) with a confirm. Labels and controls only.
- **Guests** see the chips and tags but cannot open the sheet.
- The shortfall lines, counts, board and leaderboard need no changes beyond resolving names through the roster.

## 6. Tests that pin the rules

- game-core: parse creates/uses roster keys; visibility rules 1–4 as a table; `canBeDealt` mirrors visibility; auto-bind on join by key; retire turns the mention into plain text; display resolves bound → seat name, unbound → display; property test: for any roster state, a task is never visible to a seat it would be hidden from after binding that seat to one of the task's unbound names.
- server: `addTask` with an unknown name succeeds and the roster gains the entry; `join` auto-binds and every seat's `view` is re-pushed; `bindName` / `retireName` permissions and pushes; readiness changes with binding; late-join deal honours the roster.
- web / iOS: autocomplete rows; the bind sheet; chips; decode with and without `roster`; Playwright: author mentions an absent Jess, a third phone joins as Jess and cannot see the task, host binds a nickname, the shortfall line clears.

## 7. Rollout

One PR after the party: game-core → server → web → iOS, per-task review as in `docs/PLAN_PARTY.md`. Worker deploy, live site deploy, TestFlight 1.0.4. No data migration: the deploy happens with no live rooms.

## 8. Decisions

| Decision | Who |
|---|---|
| Names are the referenced thing; a roster binds them to seats | Claude (owner agreed) |
| Unbound-name tasks are hidden from, and not dealt to, unidentified players; the host is expected to bind promptly | Owner |
| Bound mention displays the player's seat name; unbound shows the typed name | Claude (owner agreed) |
| Binding allowed after launch; never re-deals | Claude (owner agreed) |
| Anyone adds names via the autocomplete; only the host binds, unbinds, retires | Claude (owner agreed) |
| `+ <name>` autocomplete row instead of a prompt or error | Claude (owner agreed) |
| Retire ("Not coming") turns the mention into plain text | Claude |
| A bound player may also be an unbound nickname: accepted, host binds both | Owner |
