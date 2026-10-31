# Roster: mention people before they join

Status: design agreed with the owner 2026-10-31 (the night before the first party); builder-checked. **Built the same day** (owner: tonight, not after the party): Phase 0 (server only, PR #14) then Phase 1 (bindings, roster section, bind / retire, both apps) per `docs/PLAN_ROSTER.md`; amendments from the build are in §9. Supersedes the "a mention must name a current player" rule in `docs/DESIGN.md` §4.3 and the "late joiners can't be `@Name`d" line in §4.4.

## 1. Intent

Today a task's `@Name` must match a player who is already in the lobby, or the add fails with "No one here goes by that name". People write tasks about friends who arrive hours later, and some friends join under a nickname. Both block a task that should exist.

The fix: a game keeps a **roster** of referenced names. A task references names, not seats. A name is **bound** to a player (one seat) or **unbound** (nobody yet). Anyone can add a name by mentioning it; only the host binds, rebinds or retires names. Everything that asks "who does this task reference" resolves the name at read time, so a task written at 7 pm about Jess becomes Jess's task the moment Jess joins at 10 pm.

Goals: a mention never blocks an add; a player who turns out to be the referenced person never saw the task; the host can fix any name/player mismatch in two taps. Non-goals: editing task text by players; mentioning someone who never joins and still dealing that task to them; changing `@someone` / `@anyone`.

## 2. Model

`packages/game-core/src/types.ts`:

```ts
/** A name tasks reference; bound to a seat once the host (or an exact-name join) says who it is. */
export interface RosterName { key: string; display: string; seatId: string | null; createdAt: number }
export interface TaskMentions { names: string[]; someone: boolean; anyone: boolean }   // names = roster keys
```

- `key` is `nameKey(display)` (the existing squash + lowercase), unique within a game; `display` is the name as first typed, trimmed and single-spaced.
- The roster holds **referenced names only**. A player's own seat name is never a roster row; it resolves implicitly (§3.2). So the roster is empty until someone mentions a name.
- Many names may bind to one seat (nicknames); a name binds to at most one seat.
- Server table `roster`; new `roster` section (`Array<RosterName>`) sent to every client and pushed whenever it changes. `mentions.seatIds` is gone; the server stores `names`. No migration: the deploy happens with no live rooms.

### Resolution (pure, game-core)

`resolveName(key, roster, seats): string | null` — the seat a key refers to:
1. a roster row with that key and a non-null `seatId` → that seat (an explicit binding always wins);
2. else a seat whose `nameKey` equals the key → that seat (implicit own-name binding);
3. else `null` (unbound).

`isIdentified(seatId, roster)` — true when some roster row is **explicitly** bound to that seat. The implicit own-name match never counts: joining as "J" tells nobody whether J is the Jess people wrote about.

`mentionedSeats(task, roster, seats)`, `hasUnboundName(task, roster, seats)` follow from `resolveName`.

## 3. Rules

### 3.1 Authoring

`parseMentions(text, roster, seats)` scans `@` tokens as today. A token that matches a seat's own name, or an existing roster name (by key), becomes that key. A token that matches nothing is **not an error**: it is a new unbound roster name (the server creates the row on `addTask`). `self-mention` stays an error when the token resolves to the author's own seat at authoring time.

Client autocomplete (`web/src/pages/lobby/mentions.ts` ↔ `ios/PlayOYBC/Game/Mentions.swift`) lists for a partial: joined players, bound names, unbound names (dashed glyph), `someone`, `anyone`, then, when the partial matches none of them exactly, a final row that adds the typed name (`+ Jess`). Picking it inserts `@Jess ` and the add proceeds. The `unknown-mention` error and its copy are removed.

### 3.2 Binding

- **Auto-bind on join.** `join` with a name whose key equals an **unbound** roster name binds it to the new seat. A key that equals an existing seat's own name is the existing reclaim path, unchanged. A key that equals a name **explicitly bound to another seat** (someone joins as "Cody" while the host bound "Cody" to C-Dog) seats the newcomer normally and leaves the binding alone: the explicit binding wins, the lobby shows both the player "Cody" and the "Cody" tag under C-Dog, and the host rebinds if the first binding was wrong.
- **Self-authored name.** If the joiner's key auto-binds a name that appears in a task they wrote, the bind still happens; that task is simply not dealable to them (§3.4) and remains visible to them as its author.
- **Host bind.** `bindName { key, seatId }` (host only, any stage) points a roster name at a seat; `seatId: null` unbinds. Binding a name to a task's own author is allowed (same effect as above). Own seat names are not rows, so `bindName` cannot move them.
- **Host retire.** `retireName { key }` (host only, any stage) removes the row, drops the key from every task's `names`, and rewrites those tasks' text so the token loses its `@` (`@Jess` → `Jess`), so display, bold and visibility stay consistent and a later re-add of "Jess" does not re-attach old tasks.
- Reclaim and transfer leave names and bindings untouched.

### 3.3 Visibility (pool)

For viewer seat V and task T (the author always sees their own task):

1. `someone` / `anyone` tasks: author only (unchanged).
2. T mentions a name that resolves to V: hidden.
3. T mentions any unbound name and V is **not identified**: hidden (V might be that person).
4. Otherwise visible.

Hidden rows use the existing blurred treatment. The server pushes `view` to every seat whenever the roster changes (auto-bind on join included).

### 3.4 Dealing and readiness

`canBeDealt(task, seatId, roster, seats)` is false exactly when rule 2 or 3 would hide the task from that seat (the author exception does not apply to dealing: a task is never dealt to a seat it references). `dealableCounts`, `shortfalls`, `dealBoard`, `assignAnyone` and the late-join deal all take the roster and use this predicate, so an unidentified player's count excludes unbound-name tasks and the lobby's shortfall lines say so. Launch is gated by shortfalls only; an unbound name never blocks launch by itself.

`@anyone` interplay: an `@anyone` task that also carries any name (bound or unbound) is a *mixed* task under `docs/PARTY_FEATURES.md` §2: it adds nothing to the guaranteed share, and `assignAnyone` assigns it only to a seat for which `canBeDealt` is true (none → it stays undealt). Pure `@anyone` tasks are unaffected.

Binding after launch never re-deals. A task already on a board stays there even if its name later binds to that board's owner (the host sees both chips and can act before launch; after launch it is a known, accepted edge).

### 3.5 Display

Board cells and pool rows resolve a mention to the **bound player's seat name** when the key resolves to a seat (explicit or implicit), else to the roster `display`; the `refs` ranges and bold rendering from `docs/PARTY_FEATURES.md` apply unchanged. The stored `names` are canonical for visibility and dealing; display rescans the text against roster + seats to place `refs` (a retired name has lost its `@`, so it no longer scans as a mention). `resolveMentionRefs(text, roster, seats, someoneName)` replaces the seats-only signature.

## 4. Server

- State: `roster` table `(key TEXT PRIMARY KEY, display TEXT NOT NULL, seatId TEXT NULL, createdAt INTEGER NOT NULL)`; `tasks.mentions` JSON stores `names`.
- Ops: `addTask` creates missing roster rows; `join` auto-binds per §3.2; `bindName`, `retireName` (host only; `not-host`, `name-not-found`, `seat-not-found`, `invalid-argument`); every roster change pushes `all: ['roster', 'view', 'game']` (`game` because `shortfalls` / `dealable` move) and, after launch, `standings` if a retire changed board text (it does not change marks).
- Sections: new `roster`; `view`, `board`, `standings` built through the roster. `Section`, `StateMsg`, `ALL_SECTIONS`, the hello replay and both clients' section merges gain `roster` (defaulted `[]`).
- Limits: 100 roster rows per game (`resource-exhausted` from `addTask` beyond that; `join` never creates rows, so it is never blocked by the cap). Name validation = the join name rules (`invalid-name`).

## 5. Clients (web and iOS, same behaviour)

- **Autocomplete** per §3.1.
- **Lobby avatar stack / chip list**: joined players as today; unbound names as dashed chips after them. A name explicitly bound to a player shows as a small tag under that player's chip (chip "C-Dog", tag "Cody"). Host-tappable; guests see, cannot open.
- **Bind sheet** (host taps a dashed chip or a tag): title is the name (`Jess`), a radio list of joined players, `Nobody yet` (unbind), and a quiet red `Not coming` (retire) behind a confirm. Labels and controls only.
- Shortfall lines, counts, board and leaderboard need no changes beyond resolving names through the roster.

## 6. Tests that pin the rules

- game-core: `resolveName` precedence (explicit beats implicit beats unbound); `isIdentified` false for a seat with only its own name; parse creates/uses keys and never errors on unknown names; visibility rules 1–4 as a table, including an unidentified viewer and an identified viewer against the same unbound-name task; `canBeDealt` mirrors visibility with no author exception; auto-bind by key; explicit binding survives a same-name join; retire rewrites text and drops the key; mixed `@anyone` + unbound name adds nothing to the share and is assigned only where dealable; property test: for any roster state, a task is never visible to a seat it would be hidden from after binding that seat to one of the task's unbound names.
- server: `addTask` with an unknown name succeeds and the roster gains the row; `join` auto-binds and every seat's `view` is re-pushed; a join matching a bound nickname seats normally; `bindName` / `retireName` permissions, pushes and text rewrite; readiness moves with binding; late-join deal honours the roster; the cap.
- web / iOS: autocomplete rows; chips and tags; the bind sheet; decode with and without `roster`; Playwright: A mentions an absent Jess, C (unidentified) cannot see it, a fourth phone joins as Jess and still cannot see it, host binds "Jessie" (joined under a nickname) and the shortfall line clears, retire turns the token plain.

## 7. Rollout

One PR after the party, on top of PR #12: game-core → server → web → iOS, per-task review as in `docs/PLAN_PARTY.md`. Worker deploy, live site deploy, TestFlight 1.0.4. No data migration.

## 8. Decisions

| Decision | Who |
|---|---|
| Names are the referenced thing; a roster binds them to seats | Claude (owner agreed) |
| Unbound-name tasks are hidden from, and not dealt to, unidentified players; the host binds promptly | Owner |
| "Identified" = explicitly bound to a referenced name; a player's own name never counts | Claude |
| Own seat names are not roster rows; they resolve implicitly and cannot be moved | Claude |
| A join that matches a name bound to someone else seats normally; the explicit binding wins until the host rebinds | Claude |
| Binding a name to a task's author is allowed; that task is just not dealt to them | Claude |
| Retire rewrites the token to plain text (drops the `@`) | Claude |
| Mixed `@anyone` + name tasks add nothing to the share; assigned only where dealable | Claude |
| Bound mention displays the player's seat name; unbound shows the typed name | Claude (owner agreed) |
| Binding allowed after launch; never re-deals | Claude (owner agreed) |
| Anyone adds names via the autocomplete; only the host binds, unbinds, retires | Claude (owner agreed) |
| `+ <name>` autocomplete row instead of a prompt or error | Claude (owner agreed) |
| 100 referenced names per game; joins never count against it | Claude |
| Built after PR #12 merges | Claude |

## 9. Amendments from the build (2026-10-31)

| Change | Why |
|---|---|
| No `roster` table. A roster row is derived: every `@word` in the pool that matches no seat's own name (`buildRoster`), with the host's binding from a `bindings` table (key → seatId). `TaskMentions.names` records the keys typed as unbound at authoring. | Nothing to migrate, nothing to cap; `join` never creates rows, so the §4 cap is moot. |
| Resolution re-scans the text against the current seats on every read (`scanTask` / `MentionContext`), with explicit bindings folded into the scanner (`scanMentions(text, seats, bindings)`), so a bound name IS that seat for parse, display, visibility, dealing and readiness. | One rule everywhere; a name written before its person joined resolves the moment they do. |
| **Identified** = a seat some task names exactly (stored seat id, exact-name match, or explicit binding). A nearly named seat is kept from that task but is not identified. | §2's definition plus the implicit own-name match; the party has no time to bind everyone by hand. |
| **Near-miss refusal.** An unknown `@word` whose key is a seat's first name, a 3+ char prefix of it, or that name plus "s" is refused at add time with the apps' existing `unknown-mention` copy, and such a seat is kept from the task at read time regardless. | "@Cody" with "Cody B" seated must never reach Cody B. |
| Curly apostrophes fold to plain ones in `nameKey` and in the scanner; name matching compares whole words lower-cased. | The iOS keyboard types `’`. |
| Retire rewrites `@Jess` → `Jess` for whole tokens only (`retireNameInText`) and drops the key from `names`. | As §3.2, pinned by tests. |
| The `roster` section rides with `view` on every push that can change it (claim, join, addTask, deleteTask, bindName, retireName). | Clients hold it like `standings`. |
