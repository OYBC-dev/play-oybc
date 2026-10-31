# Party features (2026-10-30): mentions, free space, standings, @anyone, pool counts

Status: design approved in chat by the owner 2026-10-30 (Friday, after the rehearsal); ships before the party on 2026-10-31. Companion plan: `docs/PLAN_PARTY.md`. The realtime server design (`docs/REALTIME_SERVER.md`) stays canonical for everything not covered here.

## 1. Intent

Six changes the owner asked for after the rehearsal, all player-facing:

1. **Reference tasks read as names, not `@` tokens** — a mention shows as the resolved name in bold with no `@`, on the board and in the pool.
2. **Square colours tell the three states apart** — normal marked, reference marked, and in a completed line each have their own fill.
3. **Pool counts are per player** — the lobby shows how many pool tasks can be dealt to *you*, next to the pool total.
4. **Free space is a host option, off by default** — no auto-marked centre unless the host turns it on; a board then needs 25 tasks.
5. **The leaderboard ranks people, not events** — one row per player with bingo count, squares marked, and, for players with no bingo yet, their best line.
6. **An `@anyone` task lands on exactly one board** — that is what makes it unique.

Non-goals: being seated in several games at once (post-party); editing a task's text; any change to the wire protocol beyond the fields below; the legacy Firebase backend (`functions/`) keeps compiling and keeps its behaviour, nothing more.

## 2. Rules (game-core)

All rules live in `packages/game-core/src` and are pure. New or changed exports:

- `DealOptions = { freeSpace: boolean; anyoneAssignment?: Readonly<Record<string, string>>; excludeTaskIds?: ReadonlySet<string> }`.
  - `freeSpace` → `centerType` is `FREE` when true, `NONE` when false; tasks needed = `fillableCellCount(GRID_SIZE, centerType)` (24 or 25).
  - `anyoneAssignment` maps an `@anyone` task id to the one seat it may be dealt to. An `@anyone` task that is in the map but assigned elsewhere is not eligible for this seat; one not in the map is eligible for everyone (legacy behaviour). When the map is present, a seat's assigned `@anyone` tasks are dealt first (capped at the board's task count) and the rest of the board is a random draw from its other eligible tasks, so every assigned task lands on its seat's board. Without the map the deal is a random draw from every eligible task, unchanged.
  - `excludeTaskIds` removes tasks a late joiner must not receive: only the `@anyone` tasks (pure or mixed) already dealt to any board. Plain tasks are shared across boards by design, so a late joiner never needs new tasks beyond the pool that was ready at launch.
- `dealBoard(tasks, seats, seatId, rng = Math.random, opts: DealOptions = { freeSpace: true })` — the default keeps the legacy backend compiling and unchanged. Throws `insufficient-pool` when eligible < needed.
- `assignAnyone(tasks, seats, rng): Record<string, string>` — shuffles the `@anyone` tasks and the seats, then deals the tasks round-robin over the seats. Every seat receives `floor(n / seats)` or `ceil(n / seats)` of them.
- `dealableCounts(tasks, seats, opts: { freeSpace: boolean }): Record<string, number>` — per seat: the tasks dealable to that seat that are not `@anyone`, plus `floor(anyoneCount / seats.length)`. This is the guaranteed minimum under `assignAnyone`, so a lobby that is ready always launches.
- `shortfalls(tasks, seats, opts = { freeSpace: true })` — unchanged shape, now `needed - dealableCounts[seat]` for seats below `needed`.
- `applyMark(state, index, desired?, opts = { freeSpace: true })` — forces the centre mark and ignores a centre tap only when `freeSpace` is true. With it false the centre is an ordinary cell.
- Mention display: `resolveMentionDisplay(text, seats, someoneName)` keeps its contract and gains a sibling `resolveMentionRefs(text, seats, someoneName): { text: string; refs: Array<[number, number]> }` where `refs` are `[start, end)` offsets into the **resolved** text in UTF-16 code units, one per resolved mention (`@Name` → the name, `@someone` → the chosen name, `@anyone` → `Anyone`). An unknown `@word` stays verbatim and gets no ref.
- `BoardCell` task cells gain `refs?: Array<[number, number]>` (absent or empty = plain task). `dealBoard` fills it.
- `PoolViewEntry` gains `refs?: Array<[number, number]>`, and its `text` is now the **display** text: `@Name` → `Name`, `@someone` → `Someone`, `@anyone` → `Anyone`. Hidden entries stay `text: null` (visibility rules unchanged).
- Standings: `lineCells(gridSize): Array<{ id: string; cells: number[] }>` (the same ids `detectBingos` emits) and
  `standings(boards: ReadonlyArray<{ seatId: string; marks: readonly boolean[]; announcedLines: readonly string[]; firstBingoSeq: number | null }>, seats, opts: { freeSpace: boolean }): Standing[]`
  with `Standing = { seatId, name, bingos, marked, bestLine, firstBingoSeq }`:
  - `bingos` = `announcedLines.length`;
  - `marked` = marks that are true, excluding the centre when `freeSpace`;
  - `bestLine` = the highest count of marked cells in any line that is **not** completed (0–4; the free centre counts as marked when `freeSpace`);
  - order: `bingos` desc, then `firstBingoSeq` asc (null last), then `bestLine` desc, then `marked` desc, then `name` asc.

## 3. Server

- `GameRow`/`GameDoc` gain `freeSpace: boolean` (stored; default `false` at claim) and the `game` section adds `tasksPerBoard` (24 when `freeSpace`, else 25) and `dealable: Record<seatId, number>` next to `shortfalls`. Persistence: the `game` table gains `freeSpace INTEGER NOT NULL DEFAULT 0`; `SqlPersistence` adds the column when `PRAGMA table_info(game)` lacks it (rooms created before this deploy load as `freeSpace: false`).
- New op `setOptions { freeSpace: boolean }`: host only, `lobby` only (`wrong-stage` otherwise), `invalid-argument` unless a boolean; push `all: ['game']`. Added to `Op` in `protocol.ts` and to `OPS`.
- `launch`: computes `assignment = assignAnyone(tasks, seats, rng)` once, then `dealBoard(..., { freeSpace, anyoneAssignment: assignment })` per seat; seeds `marks[CENTER_INDEX] = true` only when `freeSpace`. The assignment is not stored: after launch, uniqueness is enforced by `excludeTaskIds`.
- `join` while playing: `dealBoard(..., { freeSpace, excludeTaskIds: the `@anyone` taskIds present on any existing board })` — never plain tasks.
- `mark`: `applyMark(..., { freeSpace })`; pushes its existing `board` to the caller **and** `standings` to all.
- New section `standings: Standing[]` in `Section`, `StateMsg`, `ALL_SECTIONS` and `buildSections` (from `state.boards` + the announced bingo rows' lowest `seq` per seat; empty before launch). Pushed with `all` on `launch`, a playing-stage `join`, `mark`, and `end`.
- `view` entries carry `refs` and display text via `resolveMentionRefs(text, seats, 'Someone')` inside `buildPoolView`.
- Everything else (rev, epochs, redaction, reclaims, rate limits) unchanged.

## 4. Clients (web and iOS, same behaviour)

- **Snapshot**: `game.freeSpace`, `game.tasksPerBoard`, `game.dealable`, `standings` (defaults `[]`; a snapshot is complete without it), `view[].refs`, `board.cells[].refs`. iOS decodes every new field with `decodeIfPresent` and defaults, so old fixtures and old frames still decode.
- **Lobby header**: count = `"{dealable[mySeatId] ?? 0} / {tasksPerBoard}"` (web keeps `data-testid="pool-count"` on it) followed by a muted `"{view.length} in pool"`. The sheet shows the same `mine / needed`. Client launch gating = host ∧ lobby ∧ no shortfalls (the extra `pool >= 24` check goes).
- **Free space control**: ~~host only, in the lobby sheet above the Launch row~~ — moved on 2026-10-31 to the Game settings screen before creation (`docs/LOBBY_V2.md`); `createGame` carries `freeSpace`, the lobby sheet has no switch, `setOptions` is unused by the clients.
- **Task text**: pool rows and board cells render `text` with each `refs` range in bold (web: `<b>` at weight 800 inside the existing text span; iOS: `AttributedString` with `.bold()` / `.heavy` weight). Accessibility labels use the plain text.
- **Cell colours** (owner rule): unmarked = paper; normal marked = `--riso-red` / `risoRed` with the on-colour text; reference marked (`refs` non-empty) = `--riso-gold` / `risoGold` with ink-static text; in a completed line = `--riso-green` / `risoGreen` with on-colour text and the existing halftone overlay; free centre = ink with paper text. A completed line wins over marked; the bingo banner stays gold.
- **Leaderboard** (board sheet and Ended): one row per `standings` entry, in server order: rank, name, a pill `"{bingos} bingo"` / `"{bingos} bingos"` (gold fill + ink-static text; hidden when 0), and a muted meta line `"{marked} squares"` plus, when `bingos == 0`, `" · {bestLine} in a row"`. Time is dropped. Empty `standings` keeps the current empty state (`RisoMiniBoardArt` + "No bingos yet" becomes "No standings yet" only if the owner asks; keep the existing copy).
- **Bingo banners** are unchanged (still driven by `bingos`).

## 5. Compatibility and rollout

- Old rooms (created before deploy) load with `freeSpace: false`; their already-dealt boards keep their free centre cell (cell kind `free` is still rendered as ink, and `applyMark` with `freeSpace: false` simply never forces it — the stored mark is already true). Acceptable: no such game spans the deploy.
- `functions/` compiles against the defaulted signatures with no behaviour change; it is deleted after the party.
- iOS snapshot baselines are re-recorded on CI (temporary record commit, artifact, revert) for every screen that changes: lobby header/sheet, board, leaderboard, ended.
- Deploy order: Worker → live site (the Go step in `docs/SETUP.md`) → TestFlight 1.0.3 via Xcode Cloud on merge.

## 6. Decisions

| Decision | Who |
|---|---|
| Free space default off; 25 tasks per board without it | Owner |
| Colours: red normal, gold reference, green line | Owner |
| Reference name bold, no `@` | Owner |
| `@anyone` at most one board, assigned round-robin at launch; readiness counts `floor(n / seats)` | Claude |
| Standings order and the "best line" definition | Claude |
| `@someone` unchanged (every eligible board, a random other name) | Claude |
| Pool rows resolve `@someone` to "Someone" for the author | Claude |
| Leaderboard drops the clock time | Claude |
| Late joiners exclude only the `@anyone` tasks already on any board (no stored assignment); plain tasks stay shared | Claude |
