# Roster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a task reference a person who has not joined yet (`docs/ROSTER.md`): the add never fails, the task stays hidden from whoever might be that person, and it becomes theirs the moment they join or the host binds the name.

**Architecture:** Two phases that share one model. **Phase 0 (party cut, server only)** stores unresolved `@Name` tokens as name keys on the task (`TaskMentions.names`) and resolves them at read time against the seats, so a Worker deploy alone changes behaviour; both apps keep working unchanged. **Phase 1 (full roster, after the party and the design handoff)** adds the roster table, explicit host bindings (`bindName` / `retireName`), the `roster` section, and the UI on web and iOS. Phase 1 keeps every Phase 0 rule and adds explicit bindings on top (an explicit binding beats the implicit own-name match).

**Tech Stack:** TypeScript (vitest; `@cloudflare/vitest-plugin` for the server), React + CSS modules, SwiftUI + XCTest.

**Spec:** `docs/ROSTER.md` (amended by the Phase 0 decisions below).

## Global Constraints

- No explanatory copy in UI: labels, values and controls only (owner rule).
- `functions/` must keep compiling (`cd functions && npm run build`) with unchanged behaviour; every new game-core parameter is optional with the legacy default.
- Every new snapshot field and section is optional/defaulted on both clients; old frames and fixtures still decode. Phase 0 adds **no** wire field a client reads.
- Phase 0 ships with no live rooms (the deploy is before the party opens its game); Phase 1 has no data migration beyond `CREATE TABLE IF NOT EXISTS roster` and the `names` key already stored by Phase 0.
- Never commit `.setup-secrets/`, any `.env.local`, `ios/PlayOYBC/GoogleService-Info.plist`, `ios/PlayOYBC.xcodeproj`, `design_handoff_*/`, `*.zip`, `functions/.env.play-oybc`, or `ios/PlayOYBCSnapshotTests/__Snapshots__` (baselines are recorded on CI by the controller).
- iOS builds: `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer -derivedDataPath /Volumes/Stephen/play-oybc-derived -clonedSourcePackagesDirPath /Volumes/Stephen/play-oybc-spm`, destination `platform=iOS Simulator,name=iPhone 17,OS=26.3.1`, `df -h /` ≥ 10 GB first, logs only in the session scratchpad, `xcrun simctl shutdown all` + `xcrun simctl erase 84FD820D-F79E-4E67-BB6A-B96B1E822B4B` after.
- Commit trailer on every commit: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_019eM9mPBVrZqjvSyjzFKxC6`. No pushes by implementers.

## Phase 0 decisions (party cut, 2026-10-31)

| Decision | Why |
|---|---|
| An unresolved `@Name` is stored as a key in `TaskMentions.names` (optional, absent = none); `seatIds` stays for tokens that matched a seat at authoring time. | No new table, no wire change, old rows decode. |
| A name key resolves at read time to the seat whose `nameKey` equals it (the spec's implicit own-name binding, §2 rule 2); otherwise it is unbound. | Auto-bind on join falls out of resolution: the join op only has to re-push `view` and `game`, which it already does. |
| **Identified (Phase 0)** = a seat referenced by any task, by seat id or by a resolved name key. | Widens the spec's "explicitly bound" (§2) because Phase 0 has no host bind. A seat someone picked from the autocomplete is known under that name. Phase 1 revisits this (see Task 2 of Phase 1). |
| Unknown `@word` tokens render as the word without the `@`, bold (a ref), on boards and in pool rows. | Matches the bound-name treatment; the moment the person joins, the same scan resolves to their seat name. |
| No cap beyond `MAX_TASKS`; no host bind / retire; no autocomplete changes. | Everything that needs an app build waits for Phase 1. |

What Phase 0 does **not** fix tonight: a friend who joins under a nickname is never matched to the name people wrote (the host has to tell them which name to join with), and an unidentified player's pool count excludes every unbound-name task until that player is mentioned by someone.

## Review Focus

1. A task about an absent "Jess" is visible to the author and to identified players only; a fourth phone that joins as "Jess" never sees it, is never dealt it, and from that moment every other seat may see it (pin: Phase 0 Task 1 visibility table; Task 2 `join` test).
2. Readiness never promises a task the deal cannot give: whenever `shortfalls` is empty, `assignAnyone` + `dealBoard` succeed for every seat with unbound-name tasks in the pool (pin: extend the Task 1 property test with random unbound names and random "identified" seats).
3. An old task row (`mentions` without `names`) and an old client frame keep working (pin: Task 2 persistence read test; both clients untouched in Phase 0).
4. Retire (Phase 1) rewrites `@Jess` → `Jess` only for whole tokens and never inside another name or a word (pin: Phase 1 Task 1 `retireName` text test with "Jessica" and "@Jess's").
5. A join that matches a name explicitly bound to another seat seats the newcomer and leaves the binding alone (pin: Phase 1 Task 2 `join` test).

---

## Phase 0: party cut (server only) — SHIPPED (PR #14, dev 55d2642)

### Task 1: game-core — names on tasks, resolution, visibility, dealing, display

**Files:**
- Modify: `packages/game-core/src/{types,schema,mentions,visibility,deal,readiness,index}.ts`
- Modify: `functions/src/api/addTask.ts` (drop the `unknown-mention` branch; `parseMentions` no longer fails)
- Test: `packages/game-core/tests/{mentions,visibility,deal,readiness}.test.ts`

**Interfaces:**
- `TaskMentions { seatIds: string[]; someone: boolean; anyone: boolean; names?: string[] }` (`names` = `nameKey`s of tokens that matched no seat at authoring time, deduplicated, in text order).
- `parseMentions(text, seats): TaskMentions` (never fails; `ParseMentionsResult` and the `unknown-mention` error are removed from game-core).
- `MentionContext { seats: readonly Seat[]; identified: ReadonlySet<string> }` and `mentionContext(tasks, seats): MentionContext`.
- `resolveName(key, seats): Seat | null` (implicit own-name match).
- `canSeeText(task, viewerSeatId, ctx)` / `canBeDealt(task, seatId, ctx)` (third parameter required; the spec's rules 1–4, with the Phase 0 "identified").
- `buildPoolView`, `dealBoard`, `assignAnyone`, `dealableCounts`, `shortfalls` keep their signatures and build the context internally from the tasks and seats they receive.
- `resolveMentionRefs` / `resolveMentionDisplay`: an `unknown` token renders as `token.slice(1)` with a ref.

- [ ] **Step 1: Failing tests**
  - `mentions.test.ts`: `parseMentions('@Jess does X', seats)` → `{ seatIds: [], names: ['jess'], … }`; `@Jess` with Jess seated → `seatIds` only; `@Jess @jess` → one key; `resolveMentionRefs('@Jess does X', [], null)` → `{ text: 'Jess does X', refs: [[0,4]] }`; with a seat named "Jess B" and none keyed `jess`, `@Jess` is still an unbound name (seat names match by whole key, never by prefix).
  - `visibility.test.ts`: a table over viewer ∈ {author, identified other, unidentified other, the seat keyed `jess`} × task ∈ {unbound `@Jess`, `@Jess` after Jess joins, mixed `@anyone @Jess`}; `canBeDealt` mirrors it with no author exception.
  - `readiness.test.ts`: an unidentified seat's `dealableCounts` excludes unbound-name tasks; a mixed `@anyone` + unbound name adds nothing to the share; after a seat keyed `jess` joins, the other seats' counts include the `@Jess` tasks.
  - `deal.test.ts`: `dealBoard` for the seat keyed `jess` never contains a `@Jess` task; the property test from `docs/PLAN_PARTY.md` Task 1 extended with 0–5 unbound names and seats that are / are not identified.
- [ ] **Step 2: Run** `pnpm --filter game-core test` — expected: the new tests fail.
- [ ] **Step 3: Implement** per the interfaces above; `functions/src/api/addTask.ts` keeps `self-mention`.
- [ ] **Step 4: Run** `pnpm --filter game-core test && pnpm --filter game-core build && cd functions && npm run build` — expected: all pass.
- [ ] **Step 5: Commit** `feat(game-core): unresolved @Name mentions become unbound names, resolved at read time`.

### Task 2: server — accept unknown names; join re-resolves

**Files:**
- Modify: `server/src/room/ops.ts` (`addTask`: no `unknown-mention`; `self-mention` unchanged), `server/src/errors.ts` (drop the code), `server/src/room/persistence.ts` (none expected; verify `names` round-trips through the JSON column)
- Test: `server/test/{opsLobby,opsPlay,sections,state}.test.ts`

- [ ] **Step 1: Failing tests** — `addTask` with `@Jess` (nobody seated as Jess) succeeds and the task's `mentions.names` is `['jess']`; `view` hides it from an unidentified seat and shows it to an identified one; `join` as "Jess" hides it from the new seat and shows it to the others; `game.dealable` moves on that join; a playing-stage `join` as "Jess" deals a board without the `@Jess` task; a task row stored without `names` loads.
- [ ] **Step 2: Run** `pnpm --filter server test` — expected: the new tests fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm --filter server test && pnpm --filter server build` and the web unit tests (`pnpm --filter web test`; the `unknown-mention` copy may stay in both clients until Phase 1) — expected: all pass.
- [ ] **Step 5: Commit** `feat(server): a mention of someone not here is accepted and hidden until they join`.

### Task 3: deploy

- [ ] PR to `dev` (CI: `ts`; `e2e` runs; `ios` is path-skipped). Self-review, merge.
- [ ] Owner: `cd server && npx wrangler deploy` (the Worker; no site deploy, no TestFlight).
- [ ] Verify on https://play.oybc.com with two browsers: A adds `@Jess …`, B cannot see it, C joins as Jess and cannot see it, B now can.

---

## Phase 1: full roster — BUILT THE SAME DAY (owner: tonight)

Builds on Phase 0 without a design handoff: the UI follows the existing Riso kit (dashed pill = unbound name, tag on a player's pill = bound name, bind sheet = radio list + `Nobody yet` + `Not coming`, autocomplete `+ Jess` row). Bindings are a `bindings` table, the roster is derived (`docs/ROSTER.md` §9).

### Task 1: game-core — roster model and explicit bindings

**Files:**
- Modify: `packages/game-core/src/{types,schema,mentions,visibility,readiness,deal,names,index}.ts`
- Test: the same test files + `packages/game-core/tests/roster.test.ts`

**Interfaces** (spec §2 and §3):
- `RosterName { key; display; seatId: string | null; createdAt }`.
- `resolveName(key, roster, seats): string | null` (explicit binding, then implicit own-name, then null); `isIdentified(seatId, roster, tasks, seats)` = explicitly bound **or** the Phase 0 rule (owner to confirm; default: keep both, since a person picked from the autocomplete is known under that name).
- `MentionContext` gains `roster`; `mentionContext(tasks, seats, roster)`.
- `parseMentions(text, roster, seats): { mentions; newNames: Array<{ key; display }> }` (the server creates the rows).
- `retireNameInText(text, key, roster, seats): string` (whole-token rewrite `@Jess` → `Jess`; never inside `@Jessica`; `@Jess's` → `Jess's`).
- `resolveMentionRefs(text, roster, seats, someoneName)` (bound → the seat's name; unbound → `display`).

- [ ] **Step 1: Failing tests** per spec §6 (game-core bullet), plus the retire-token boundary cases from Review Focus 4.
- [ ] **Step 2: Run** `pnpm --filter game-core test` — expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm --filter game-core test && pnpm --filter game-core build && cd functions && npm run build` — expected: pass (functions passes `roster: []`).
- [ ] **Step 5: Commit** `feat(game-core): roster names with explicit bindings, retire rewrite`.

### Task 2: server — roster table, section, ops

**Files:**
- Modify: `server/src/protocol.ts` (`Op` + `bindName` / `retireName`; `Section` + `roster`), `server/src/room/{state,persistence,sections,ops,GameRoom}.ts`, `server/src/errors.ts` (`name-not-found`, `seat-not-found`)
- Test: `server/test/{opsLobby,opsPlay,sections,state,room,limits}.test.ts`

- [ ] **Step 1: Failing tests** per spec §6 (server bullet): `addTask` creates rows; `join` auto-binds an unbound key and re-pushes `view` to every seat; a join matching a bound nickname seats normally; `bindName` / `retireName` permissions, pushes (`roster`, `view`, `game`, and `standings` after launch when text changed), text rewrite; readiness moves with binding; late-join deal honours the roster; the 100-row cap (`resource-exhausted` from `addTask`, never from `join`); a room created before Phase 1 (no `roster` table) loads.
- [ ] **Step 2: Run** `pnpm --filter server test` — expected: fail.
- [ ] **Step 3: Implement** (`roster` table per spec §4; `ALL_SECTIONS` + hello replay gain `roster`).
- [ ] **Step 4: Run** `pnpm --filter server test && pnpm --filter server build` — expected: pass.
- [ ] **Step 5: Commit** `feat(server): roster section, bindName / retireName, auto-bind on join`.

### Task 3: web

**Files:**
- Modify: `web/src/game/{GameClient,roomConnection,errorMessages}.ts`, `web/src/pages/lobby/{mentions,MentionAutocomplete,AddTaskForm,PlayerList,LobbyScreen,LobbySheet}.tsx|ts` + CSS modules
- Create: `web/src/pages/lobby/BindNameSheet.tsx` (+ `.module.css`), `web/src/pages/lobby/rosterChips.ts` (pure: chip / tag model from `roster` + `seats`)
- Test: `web/src/pages/lobby/{mentions,rosterChips}.test.ts`, `LobbyScreen.test.tsx`, `web/e2e/roster.spec.ts`

- [ ] **Step 1: Failing tests** — autocomplete rows (players, bound, unbound with the dashed glyph, `someone`, `anyone`, then `+ Jess` only when the partial matches none exactly; picking inserts `@Jess `); chips and tags from a roster fixture; the bind sheet (radio list, `Nobody yet`, `Not coming` behind a confirm, host only); snapshot decode with and without `roster`; Playwright per spec §6.
- [ ] **Step 2–5:** run, implement from the handoff (Riso kit only, no hex), run `pnpm --filter web test && pnpm --filter web build && pnpm --filter web lint && pnpm --filter web e2e`, commit `feat(web): roster — unbound names in the autocomplete, dashed chips, bind sheet`.

### Task 4: iOS

**Files:**
- Modify: `ios/PlayOYBC/Models/Schema.swift`, `ios/PlayOYBC/Game/{Mentions,GameService,FakeGameService}.swift`, `ios/PlayOYBC/Views/{AddTaskView,PlayerListView,LobbyView,LobbySheetView}.swift`
- Create: `ios/PlayOYBC/Views/BindNameSheetView.swift`, `ios/PlayOYBC/Game/RosterChips.swift` (mirror of `rosterChips.ts`)
- Test: `ios/PlayOYBCTests/{Mentions,RosterChips,Schema}Tests.swift`, snapshots for the lobby chips / tags, the autocomplete with a `+ Jess` row, and the bind sheet (light + dark), recorded on CI per `docs/PLAN_PARTY.md` Task 4.

- [ ] Steps as Task 3 (`xcodegen generate` after adding files; logic tests then snapshots; the controller records baselines on CI with a temporary commit it reverts before merge). Commit `feat(ios): roster — unbound names in the autocomplete, dashed chips, bind sheet`.

### Task 5: docs, deploy, TestFlight

- [ ] `docs/ROSTER.md` status → shipped; `docs/DESIGN.md` §4.3 / §4.4 updated; `docs/PARTY_FEATURES.md` cross-reference; this plan's checkboxes.
- [ ] PR to `dev` (CI `ts` + `e2e` + `ios`), self-review, merge → Xcode Cloud builds 1.0.4.
- [ ] Owner: Worker deploy → site deploy (`docs/SETUP.md` Go step) → install 1.0.4.
