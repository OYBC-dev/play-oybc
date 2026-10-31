# Party Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the six owner-requested changes in `docs/PARTY_FEATURES.md` (mention display + colours, per-player pool counts, free-space option, standings leaderboard, one-board `@anyone`) across game-core, server, web and iOS before 2026-10-31.

**Architecture:** Rules change only in `packages/game-core` (pure, tested); the server threads one `freeSpace` option and two new per-seat derivations (`dealable`, `standings`) through existing ops and sections; both clients add optional snapshot fields with defaults and render them. No protocol shape changes beyond new optional fields, one new op (`setOptions`) and one new section (`standings`).

**Tech Stack:** TypeScript (vitest; `@cloudflare/vitest-plugin` for the server), React + CSS modules, SwiftUI + XCTest.

**Spec:** `docs/PARTY_FEATURES.md`

## Global Constraints

- No explanatory copy in UI: labels, values and controls only (owner rule).
- Colours by token only: `--riso-red|gold|green` / `Color.risoRed|risoGold|risoGreen`; on-colour text on red and green, ink-static on gold.
- `functions/` must keep compiling (`cd functions && npm run build`) with unchanged behaviour: every new game-core parameter is optional with the legacy default (`freeSpace: true`, no assignment, no exclusions).
- Every new snapshot field is optional/defaulted on both clients; old frames and fixtures still decode.
- Never commit `.setup-secrets/`, any `.env.local`, `ios/PlayOYBC/GoogleService-Info.plist`, `ios/PlayOYBC.xcodeproj` (untracked by design; regenerate with `cd ios && xcodegen generate`), `design_handoff_*/`, `*.zip`, `functions/.env.play-oybc`, or anything under `ios/PlayOYBCSnapshotTests/__Snapshots__` (baselines are recorded on CI by the controller).
- iOS builds: `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer -derivedDataPath /Volumes/Stephen/play-oybc-derived -clonedSourcePackagesDirPath /Volumes/Stephen/play-oybc-spm`, destination `platform=iOS Simulator,name=iPhone 17,OS=26.3.1`, `df -h /` ≥ 10 GB first, logs only in the session scratchpad, `xcrun simctl shutdown all` + `xcrun simctl erase 84FD820D-F79E-4E67-BB6A-B96B1E822B4B` after.
- Commit trailer on every commit: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_019eM9mPBVrZqjvSyjzFKxC6`. No pushes by implementers.

## Review Focus

1. A lobby with `@anyone` tasks and few seats: readiness says ready, so launch must never throw `insufficient-pool` (pin: Task 1 property test over random pools/seat counts).
2. Free space off, a tap on index 12 marks it and it counts toward lines and `marked` (pin: Task 1 `applyMark`/`standings` tests; Task 2 `mark` test).
3. A game created before the deploy (no `freeSpace` column) loads and plays (pin: Task 2 persistence test that creates the old table shape first).
4. A snapshot/frame without `standings`, `refs`, `dealable`, `tasksPerBoard` or `freeSpace` still decodes and renders on both clients (pin: Task 3 and Task 4 decode tests).
5. A late joiner after launch never receives a task already on another board (pin: Task 2 `join` test).

---

### Task 1: game-core rules

**Files:**
- Modify: `packages/game-core/src/{constants,deal,readiness,marks,mentions,visibility,bingoDetection,types,index}.ts`
- Test: `packages/game-core/tests/{deal,readiness,marks,mentions,visibility,bingoDetection,standings}.test.ts`

**Interfaces:**
- Produces (exact names, see spec §2): `DealOptions`, `dealBoard(tasks, seats, seatId, rng?, opts?)`, `assignAnyone(tasks, seats, rng)`, `dealableCounts(tasks, seats, opts)`, `shortfalls(tasks, seats, opts?)`, `applyMark(state, index, desired?, opts?)`, `resolveMentionRefs(text, seats, someoneName)`, `BoardCell.refs?`, `PoolViewEntry.refs?` + display text from `buildPoolView`, `lineCells(gridSize)`, `standings(boards, seats, opts)`, `Standing`.

- [ ] **Step 1: Failing tests** — add, per file:
  - `deal.test.ts`: `freeSpace:false` deals 25 task cells and no `free`; throws `insufficient-pool` at 24 eligible; an `@anyone` task assigned to s2 never appears on s1's board; `excludeTaskIds` are never dealt; a cell for `@Cody does X` has `text: 'Cody does X'` and `refs: [[0,4]]`; a plain task has no refs or `[]`.
  - `readiness.test.ts`: `dealableCounts` with 3 seats and 4 `@anyone` tasks adds 1 per seat; `shortfalls` with `freeSpace:false` needs 25; default call unchanged (24).
  - a property test (seeded rng, 200 iterations): random pool (0–40 plain, 0–10 `@anyone`, 0–5 `@Name`) and 2–8 seats; whenever `shortfalls` is empty, `assignAnyone` + `dealBoard` for every seat succeeds.
  - `marks.test.ts`: `freeSpace:false` → tapping 12 toggles it, centre not forced; default unchanged.
  - `mentions.test.ts`: `resolveMentionRefs` offsets for `@Name`, `@someone` (given name), `@anyone`, two mentions, an unknown `@word` (no ref), a name containing a space.
  - `visibility.test.ts`: `buildPoolView` display text `Cody does X` + refs for the author's view; `@someone` → `Someone`; hidden stays null.
  - `standings.test.ts`: `lineCells(5)` has 12 lines with the detector's ids; `standings` computes `marked` (centre excluded when free), `bestLine` ignores completed lines, and the sort order with ties.
- [ ] **Step 2: Run** `pnpm --filter game-core test` — expected: the new tests fail.
- [ ] **Step 3: Implement** per spec §2. `dealBoard` keeps its positional signature (`rng` fourth, `opts` fifth).
- [ ] **Step 4: Run** `pnpm --filter game-core test && pnpm --filter game-core build && cd functions && npm run build` — expected: all pass.
- [ ] **Step 5: Commit** `feat(game-core): free-space option, @anyone assignment, mention refs, standings`.

### Task 2: server

**Files:**
- Modify: `server/src/protocol.ts`, `server/src/room/{state,persistence,sections,ops,GameRoom}.ts`
- Test: `server/test/{opsLobby,opsPlay,sections,state,room}.test.ts` (+ a persistence migration test)

**Interfaces:**
- Consumes: Task 1 exports.
- Produces: `Op` gains `'setOptions'`; `Section` gains `'standings'`; `StateMsg.standings?: Standing[]`; `GameDoc` on the wire gains `freeSpace`, `tasksPerBoard`, `dealable`; `view[].refs`; `board.cells[].refs`.

- [ ] **Step 1: Failing tests**
  - `opsLobby.test.ts`: `setOptions {freeSpace:true}` by host in lobby → game.freeSpace true, push all game; by guest → `not-host`; while playing → `wrong-stage`; `{freeSpace:'x'}` → `invalid-argument`.
  - `opsPlay.test.ts`: launch with `freeSpace:false` → 25 task cells, `marks[12]` false; launch with `freeSpace:true` → as today; two `@anyone` tasks across 3 seats appear on at most one board each; a playing-stage `join` gets no task already on another board (seed a pool where only exclusion makes that true); `mark` on 12 with `freeSpace:false` marks it and pushes `standings` to all; `standings` section after two marks and one bingo.
  - `sections.test.ts`: `game` carries `tasksPerBoard` 25/24 and `dealable` for every seat; `view` entries carry display text + refs; `standings` empty in lobby.
  - persistence test: create the `game` table with the pre-feature column list, insert a row, construct `SqlPersistence` → `load().game.freeSpace === false` and `putGame` round-trips `freeSpace`.
- [ ] **Step 2: Run** `cd server && npx vitest run` — expected: fail.
- [ ] **Step 3: Implement** per spec §3.
- [ ] **Step 4: Run** `cd server && npx vitest run && npx tsc --noEmit` — expected: pass.
- [ ] **Step 5: Commit** `feat(server): setOptions, free space, standings section, @anyone assignment, dealable counts, mention refs`.

### Task 3: web client

**Files:**
- Modify: `web/src/game/{GameClient,wsGameClient,roomConnection,fakeGameClient,firebaseGameClient}.ts`, `web/src/pages/lobby/{LobbyScreen,LobbySheet,PoolList,constants}.ts(x)` + css, `web/src/pages/play/{BoardGrid,Leaderboard,PlayScreen,EndedScreen}.tsx` + css, `web/e2e/fullGame.spec.ts`
- Test: the matching `*.test.tsx`

**Interfaces:**
- Consumes: Task 2 wire fields; `GameClient` gains `setOptions(gameId, { freeSpace })`.

- [ ] **Step 1: Failing tests** — snapshot builder accepts a frame without `standings` (defaults `[]`); lobby header shows `"6 / 25"` from `dealable[me]` and `"30 in pool"`; host sees the `Free space` switch and toggling calls `setOptions`; guest sees none; pool row renders `Cody` in `<b>` with no `@`; board cell with refs gets `data-ref="true"` and the gold fill when marked; a cell in a completed line gets green; `Leaderboard` renders standings rows (pill text, meta line, hidden pill at 0 bingos); Ended uses standings.
- [ ] **Step 2: Run** `pnpm --filter web test -- --run` — expected: fail.
- [ ] **Step 3: Implement** per spec §4; delete `MIN_POOL_SIZE` uses in favour of `game.tasksPerBoard`.
- [ ] **Step 4: Update** `web/e2e/fullGame.spec.ts` for display text in the pool (`Stephen falls asleep` bold, hidden for A), 25-task boards (free space off by default; the pool fixture must cover 25 per seat), and the standings leaderboard.
- [ ] **Step 5: Run** `pnpm --filter web test -- --run && pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build && pnpm --filter web e2e` — expected: pass.
- [ ] **Step 6: Commit** `feat(web): mention names, cell colours, per-player pool counts, free-space switch, standings leaderboard`.

### Task 4: iOS client

**Files:**
- Modify: `ios/PlayOYBC/Models/Schema.swift`, `ios/PlayOYBC/Services/{GameService,RoomConnection,WebSocketGameService,FakeGameService}.swift`, `ios/PlayOYBC/Game/{GameConstants,LobbyLogic}.swift`, `ios/PlayOYBC/Views/{LobbyView,LobbySheetView,PoolListView,BoardGridView,LeaderboardView,EndedView,PlayView}.swift`, `ios/PlayOYBCSnapshotTests/SnapshotFixtures.swift`
- Test: `ios/PlayOYBCTests/{SchemaDecodingTests,WireDecodingTests,GameLogicTests}.swift` (+ a `MentionTextTests` if a helper is added)

**Interfaces:**
- Consumes: the same wire fields; `GameService.setOptions(gameId:freeSpace:)`.

- [ ] **Step 1: Failing tests** — `GameDoc` decodes with and without `freeSpace`/`tasksPerBoard`/`dealable`; `StateFrame` with and without `standings`; `BoardCell`/`PoolViewEntry` with and without `refs`; the attributed-text helper bolds exactly the UTF-16 ranges; `LobbyLogic.canLaunch` no longer needs `poolSize`.
- [ ] **Step 2: Run** the `PlayOYBCTests` scheme — expected: fail to compile/pass.
- [ ] **Step 3: Implement** per spec §4; fixtures: give two board cells and one pool row `refs`, add `standings` to the playing/ended fixtures (4 players, two with bingos).
- [ ] **Step 4: Run** the logic scheme (green) and the `PlayOYBCSnapshotTests` scheme once; report the red set (expected: lobby, board, leaderboard, ended screens). Do not touch `__Snapshots__`.
- [ ] **Step 5: Commit** `feat(ios): mention names, cell colours, per-player pool counts, free-space switch, standings leaderboard`.

### Task 5: docs and rollout (controller)

- [ ] Record iOS snapshot baselines on CI (temporary record commit → artifact → commit PNGs → revert).
- [ ] `docs/SETUP.md`: iOS manual-test steps for the free-space switch and the standings sheet; `docs/DESIGN.md` pointer to `docs/PARTY_FEATURES.md` for cell states and the leaderboard.
- [ ] Final whole-branch review, fix wave, PR, merge; Worker deploy, live-site Go, TestFlight 1.0.3.
