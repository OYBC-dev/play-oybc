# Play OYBC MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up Play OYBC as its own repo + Firebase project and ship a party-ready MVP (mobile web first, then native iOS) for 2026-10-31, then remove Play from the oybc repo.

**Architecture:** Server-authoritative Firebase. Every write is a callable Cloud Function; clients only read Firestore through listeners on documents scoped to them, and security rules deny every client write. All game logic (mention parsing, hiding, dealing, line detection, bingo ordering) lives in `packages/game-core`, a pure-TS package copied from oybc's `@oybc/bingo-core`, bundled into `functions/` with esbuild. Clients (React web, SwiftUI iOS) render server state and contain no game logic.

**Tech Stack:** pnpm 9 workspace · TypeScript · Jest (game-core) · Firebase (Anonymous Auth, Firestore, Functions v2 on Node 22, Hosting) · `firebase-functions` ^7, `firebase-admin` ^14 · Vitest + `@firebase/rules-unit-testing` + Firebase Emulator Suite · React 19 + Vite + react-router-dom + `qrcode.react` (web) · Playwright (web e2e) · SwiftUI + XcodeGen + firebase-ios-sdk ≥ 11 (FirebaseAuth, FirebaseFirestore, FirebaseFunctions), iOS 17+ · GitHub Actions.

**Spec:** `docs/DESIGN.md` in the new repo (copied in Task 1 from the approved `play-oybc-mvp-design.md`). Read it before any task.

## Global Constraints

- New repo lives at `/Volumes/Stephen/play-oybc`; GitHub `2014sheas/play-oybc`. No runtime or build dependency on the oybc repo or `oybc-dev-e2668`; reused code is **copied**.
- All Xcode builds use `-derivedDataPath /Volumes/Stephen/play-oybc-derived` (never an internal derived-data dir).
- Board: **5×5, FREE center at index 12**, 24 tasks per board. `GRID_SIZE = 5`, `TASKS_PER_BOARD = 24`.
- Clients never write Firestore. `firestore.rules`: every `write` is `false`.
- A blurred pool entry carries **no task text** in any document the viewer can read.
- Game stages: `'lobby' | 'playing' | 'ended'`.
- Display names: trimmed, inner whitespace collapsed to one space, 1–20 chars, letters/digits/space/`'`/`’`/`-` only; uniqueness is case-insensitive.
- Game code: 5 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`; join link path `/g/<CODE>`.
- Banner copy exactly: `"<Name> got a bingo!"`. Lobby shortfall copy exactly: `"<Name> needs <n> more task"` / `"... more tasks"` (n = 1 singular). Reclaim prompt: `"<Name> wants back in"`.
- Owner UI rule (carried from oybc): screens carry labels, values and controls — no explanatory sentences (no "Tip:", helper lines, captions). Allowed: validation errors, loading/error states, confirm-dialog bodies, one-line empty states.
- Write "Bingo" in normal case (never "BINGO") in UI copy.
- Web is built first for every feature; iOS (Tasks 15–17) follows. If the date gets tight, iOS slips, web does not.
- Functions region `us-central1`; every callable gets `minInstances` from a param `MIN_INSTANCES` (default `0`, set to `1` for the party).

## Review Focus

1. **Two bingos at the same instant** (two players, or one mark completing two lines) → each gets a distinct, gap-free `seq` and nothing is announced twice. Test in Task 8 (`toggleMark` concurrency) and Task 4 (`applyMark` two-lines).
2. **Hidden text reaching a client** through any readable doc (pool view, board, shortfall map, bingo doc) → never. Tests in Task 3 (`buildPoolView`), Task 5 (rules: `tasks` unreadable), Task 7 (written view docs contain no hidden text).
3. **Page reload / phone sleep mid-game** → same seat, same board, same marks, no rejoin prompt. Test in Task 13 (Playwright reload step).
4. **Name variants** (`"cody"`, `" Cody "`, `"CODY"`) for an existing seat → treated as the same name (reclaim path), never a second seat. Tests in Task 3 (`nameKey`) and Task 6 (`joinGame`).
5. **Mention names that prefix each other** (`Jo` and `Josh`) and `@` inside words (`a@b.com`) → `@Josh` resolves to Josh, not Jo; emails are plain text. Test in Task 3 (`parseMentions`).

---

## Firestore layout (decided — used by Tasks 5–17)

A **seat** is a player's identity inside a game, keyed by a random `seatId`. A Firebase uid maps to a seat through `members/{uid}`, so seat reclaim only rewrites that mapping.

| Path | Fields | Who can read |
| --- | --- | --- |
| `codes/{code}` | `gameId` | nobody (server only) |
| `games/{gameId}` | `code, stage, hostSeatId, createdAt, launchedAt?, endedAt?, bingoCount, shortfalls: Record<seatId, number>, reviewGate: false` | members |
| `games/{g}/members/{uid}` | `seatId` | that uid |
| `games/{g}/seats/{seatId}` | `name, nameKey, joinedAt` | members |
| `games/{g}/tasks/{taskId}` | `text, authorSeatId, mentions, createdAt` | nobody |
| `games/{g}/views/{seatId}` | `entries: PoolViewEntry[], updatedAt` | the member holding that seat |
| `games/{g}/boards/{seatId}` | `cells: BoardCell[25], marks: boolean[25], completedLines: string[], announcedLines: string[]` | the member holding that seat |
| `games/{g}/bingos/{bingoId}` | `seq, seatId, name, line, playerBingoNumber, at, status` | members, only where `status == 'announced'` |
| `games/{g}/reclaims/{reclaimId}` | `requesterUid, name, seatId, status: 'pending'\|'approved'\|'denied', createdAt` | the requester, and the host's member |

Timestamps are epoch milliseconds (numbers), so web and iOS decode them identically.

---

### Task 0: Owner setup (manual — Stephen)

Nothing in Tasks 5+ can deploy, and Tasks 15–17 can't build, until this is done. Tasks 1–4 can run in parallel with it.

- [ ] **Step 1:** Create the GitHub repo `2014sheas/play-oybc` (private, empty — no README).
- [ ] **Step 2:** Create a new Firebase project (`play-oybc`), upgrade to **Blaze**, set a budget alert.
- [ ] **Step 3:** Enable **Authentication → Anonymous**. Create **Firestore** (production mode, location `nam5`). Enable **Hosting**.
- [ ] **Step 4:** Register a **web app**; paste its config values into `web/.env.local` (keys listed in Task 10) — gitignored.
- [ ] **Step 5:** Pick the iOS bundle id (`com.oybc.PlayOYBC`); register an **iOS app** in the Firebase project with it; download `GoogleService-Info.plist` to `ios/PlayOYBC/GoogleService-Info.plist` — gitignored.
- [ ] **Step 6:** In App Store Connect, create the app record with that bundle id and an internal TestFlight group.
- [ ] **Step 7:** Record the project id + bundle id in `docs/SETUP.md` (Task 1 creates the file with blanks).

---

### Task 1: Repo bootstrap

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `.nvmrc` (`22`), `CLAUDE.md`, `docs/DESIGN.md`, `docs/PLAN_MVP.md`, `docs/PLAY_OYBC.md`, `docs/SETUP.md`, `firebase.json`, `.firebaserc`, `firestore.rules` (deny-all placeholder), `firestore.indexes.json`, `.github/workflows/ci.yml`

- [ ] **Step 1:** `mkdir /Volumes/Stephen/play-oybc && cd` it, `git init -b main`, `git remote add origin https://github.com/2014sheas/play-oybc.git`.
- [ ] **Step 2:** Root `package.json`: `"private": true`, `"packageManager": "pnpm@9.15.4"`, scripts `build`/`test`/`lint` that run `pnpm -r <script>`. `pnpm-workspace.yaml` lists `packages/*`, `web`, `functions`. `.gitignore`: `node_modules`, `dist`, `lib`, `.env.local`, `ios/PlayOYBC/GoogleService-Info.plist`, `ios/*.xcodeproj`, `.firebase`, `*-debug.log`, `playwright-report`, `test-results`.
- [ ] **Step 3:** Copy docs: the approved design → `docs/DESIGN.md`; this plan → `docs/PLAN_MVP.md`; oybc `docs/play/PLAY_OYBC.md` → `docs/PLAY_OYBC.md`, then edit it: §1 core loop step 5 → "a single bingo wins; the game continues until the host ends it"; §6 replaced by a pointer to `DESIGN.md` §5; §10 add rows from `DESIGN.md` §7 and mark the 2026-07-06 monorepo row "Superseded 2026-10-22 — standalone repo". `docs/SETUP.md`: headings Firebase project id / iOS bundle id / web env keys / emulator commands, blanks to fill.
- [ ] **Step 4:** `CLAUDE.md` for the new repo, containing: one-paragraph product summary; the six inverted invariants table from oybc `apps/play/CLAUDE.md` (minus the oybc-specific "Shared-boundary" bullet); the Global Constraints section of this plan verbatim; the Firestore layout table above; commands (`pnpm test`, `pnpm --filter functions test` (emulators), `pnpm --filter web dev`, the iOS xcodebuild line from Task 15); "every write is a callable; never add a client write rule".
- [ ] **Step 5:** `firebase.json`: `firestore` (rules + indexes), `functions` (`source: functions`, `predeploy: pnpm --filter functions build`), `hosting` (`public: web/dist`, SPA rewrite `** → /index.html`), `emulators` (auth 9099, functions 5001, firestore 8080, hosting 5000, ui enabled). `.firebaserc` default = project id from Task 0 (placeholder `play-oybc` until then).
- [ ] **Step 6:** `.github/workflows/ci.yml` job `ts` on ubuntu: checkout, `pnpm/action-setup@v6`, Node 22, `pnpm install --frozen-lockfile`, `pnpm -r build`, `pnpm --filter game-core test`. (Tasks 5, 10 and 15 append their own steps/jobs.)
- [ ] **Step 7:** `pnpm install` → succeeds with an empty workspace. Commit `chore: bootstrap play-oybc repo` and `git push -u origin main` (after Task 0 Step 1). Verify `git rev-parse HEAD` equals `git rev-parse origin/main`.

---

### Task 2: `game-core` — port bingo-core

**Files:**
- Create: `packages/game-core/{package.json,tsconfig.json,jest.config.js}`, `packages/game-core/src/{index.ts,bingoDetection.ts,shuffle.ts,placement.ts,constants.ts}`, `packages/game-core/tests/{seededRng.ts,bingoDetection.test.ts,shuffle.test.ts,placement.test.ts}` (+ any vector fixture JSONs those tests load)

**Interfaces:**
- Produces: `detectBingos(grid: boolean[], gridSize: BoardSize): { completedLines: string[]; isGreenlog: boolean }` (line ids `row_0..4`, `col_0..4`, `diag_main`, `diag_anti`); `fisherYatesShuffle<T>(arr: readonly T[], rng?: () => number): T[]`; `placeBoard<T extends {id: string}>(args): (T|null)[]`; `CenterSquareType` (`FREE`, `NONE` only); `BOARD_SIZES`, `BoardSize`; test helper `makeSeededRng(seed: number): () => number`.

- [ ] **Step 1:** Copy from oybc `packages/bingo-core/`: `src/bingoDetection.ts`, `src/shuffle.ts`, `src/placement.ts`, `src/constants.ts`, `src/centerSquare.ts`, `tests/seededRng.ts` and the tests/fixtures covering those modules; `package.json`/`tsconfig.json`/`jest.config.js` (rename package to `game-core`, `"private": true`).
- [ ] **Step 2:** Strip Do-only surface: delete `CenterSquareType.CHOSEN` and everything that references it (`effectiveCenter`, `isLegacyChosen*`, `chosenCenterId` in `placeBoard`, `shuffleUnlockedSlots`, `formatBingoMessage`, `getHighlightedSquares`, `getCenterDisplayText`), plus the tests/vectors for those. Inline what `placeBoard` still needs from `centerSquare.ts` and delete that file if nothing else uses it. Remove "Do"/"wizard"/"spawn" wording from doc comments.
- [ ] **Step 3:** Run `pnpm --filter game-core test` → all remaining suites PASS; `pnpm --filter game-core build` → `dist/` emitted.
- [ ] **Step 4:** Commit `feat(game-core): port bingo detection, shuffle, placement from oybc bingo-core`.

---

### Task 3: `game-core` — names, mentions, visibility

**Files:**
- Create: `packages/game-core/src/{types.ts,names.ts,mentions.ts,visibility.ts}`, tests `packages/game-core/tests/{names,mentions,visibility}.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export interface Seat { seatId: string; name: string; joinedAt: number }
  export interface TaskMentions { seatIds: string[]; someone: boolean; anyone: boolean }
  export interface PoolTask { id: string; text: string; authorSeatId: string; mentions: TaskMentions; createdAt: number }
  export interface PoolViewEntry { taskId: string; authorName: string; text: string | null; mine: boolean }
  ```
- Produces: `normalizeName(raw: string): string | null`; `nameKey(name: string): string`; `parseMentions(text: string, seats: readonly Seat[]): { ok: true; mentions: TaskMentions } | { ok: false; error: 'unknown-mention'; token: string }`; `canSeeText(task: PoolTask, viewerSeatId: string): boolean`; `canBeDealt(task: PoolTask, seatId: string): boolean`; `buildPoolView(tasks: readonly PoolTask[], seats: readonly Seat[], viewerSeatId: string): PoolViewEntry[]`.

- [ ] **Step 1: Failing tests** (`names.test.ts`, `mentions.test.ts`, `visibility.test.ts`):
  ```ts
  expect(normalizeName('  Mary   Jane ')).toBe('Mary Jane');
  expect(normalizeName('')).toBeNull();
  expect(normalizeName('x'.repeat(21))).toBeNull();
  expect(normalizeName('Cody<script>')).toBeNull();
  expect(nameKey(' CODY ')).toBe(nameKey('cody'));

  const seats = [seat('s1','Jo'), seat('s2','Josh'), seat('s3','Mary Jane')];
  expect(parseMentions('@Josh naps', seats)).toEqual({ ok: true, mentions: { seatIds: ['s2'], someone: false, anyone: false } });
  expect(parseMentions('@jo and @MARY JANE dance', seats).mentions.seatIds).toEqual(['s1','s3']);
  expect(parseMentions('@someone takes a shot', seats).mentions).toEqual({ seatIds: [], someone: true, anyone: false });
  expect(parseMentions('@Anyone leaves', seats).mentions.anyone).toBe(true);
  expect(parseMentions('mail a@b.com', seats)).toEqual({ ok: true, mentions: { seatIds: [], someone: false, anyone: false } });
  expect(parseMentions('@Bob sings', seats)).toEqual({ ok: false, error: 'unknown-mention', token: '@Bob' });
  expect(parseMentions('@Josh @Josh', seats).mentions.seatIds).toEqual(['s2']);

  // visibility (author = s1)
  plain → canSeeText true for s1, s2; canBeDealt true for all
  @Josh  → canSeeText(s2) false, (s1) true, (s3) true; canBeDealt(s2) false
  @someone / @anyone → canSeeText only s1; canBeDealt true for all (incl. s1)
  buildPoolView: hidden entries have text === null; mine === (authorSeatId === viewer); sorted by createdAt asc; authorName from seats
  ```
- [ ] **Step 2:** Run `pnpm --filter game-core test` → FAIL (modules missing).
- [ ] **Step 3: Implement.** `parseMentions` scans for `@` not preceded by a letter/digit; at each, checks `someone`/`anyone` keywords (case-insensitive, followed by a non-letter/digit or end), else the **longest** seat name matching case-insensitively at that position followed by a non-letter/digit or end; no match → `unknown-mention` with token = `@` + the following run of letters/digits. `seatIds` deduped, in first-appearance order. Rejecting a self-mention is the caller's job (Task 7). `canSeeText`: author → true; `someone || anyone` → false; viewer in `seatIds` → false; else true. `canBeDealt`: `!seatIds.includes(seatId)`.
- [ ] **Step 4:** Run tests → PASS.
- [ ] **Step 5:** Commit `feat(game-core): names, mention parsing, visibility rules`.

---

### Task 4: `game-core` — readiness, dealing, marking, codes

**Files:**
- Create: `packages/game-core/src/{constants.ts (extend),readiness.ts,deal.ts,marks.ts,gameCode.ts,schema.ts}`, tests `packages/game-core/tests/{readiness,deal,marks,gameCode}.test.ts`

**Interfaces:**
- Consumes: Task 3 types, `canBeDealt`, `placeBoard`, `detectBingos`, `fisherYatesShuffle`.
- Produces:
  ```ts
  export const GRID_SIZE = 5; export const TASKS_PER_BOARD = 24; export const CENTER_INDEX = 12;
  export type BoardCell = { kind: 'task'; taskId: string; text: string } | { kind: 'free' };
  export function shortfalls(tasks: readonly PoolTask[], seats: readonly Seat[]): Record<string, number>; // only seats short, value = 24 - eligible
  export function dealBoard(tasks: readonly PoolTask[], seats: readonly Seat[], seatId: string, rng?: () => number): BoardCell[];
  export function applyMark(state: { marks: boolean[]; announcedLines: string[] }, index: number): { marks: boolean[]; completedLines: string[]; newLines: string[] };
  export function generateGameCode(rng?: () => number): string;
  export const GAME_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  ```
  `schema.ts`: TS interfaces for every doc in the Firestore layout table (`GameDoc`, `MemberDoc`, `SeatDoc`, `TaskDoc`, `ViewDoc`, `BoardDoc`, `BingoDoc`, `ReclaimDoc`), plus callable request/response types `CreateGameReq/Res`, `JoinGameReq/Res` (`{ status: 'joined' | 'resumed'; gameId; seatId } | { status: 'reclaim-pending'; gameId; reclaimId }`), `AddTaskReq`, `DeleteTaskReq`, `LaunchGameReq`, `ToggleMarkReq/Res`, `EndGameReq`, `ResolveReclaimReq`, `TransferHostReq`. Every request carries `gameId` except create/join.
- [ ] **Step 1: Failing tests:**
  ```ts
  // readiness: 3 seats, 30 plain tasks + 8 tasks @s2 → {} ; 24 plain + 1 @s2 → { s2: 1 }
  // deal (seeded rng 42): 25 cells, cells[12] = {kind:'free'}, 24 distinct taskIds,
  //   never a task that mentions the seat; same seed ⇒ same board
  // deal @someone: text "@someone takes a shot" on s1's board becomes "<other seat name> takes a shot",
  //   never s1's own name across 50 seeds; two @someone tokens in one task resolve to the same name;
  //   with a single seat, text keeps "@someone" verbatim
  // deal @anyone: text unchanged
  // deal with <24 eligible throws Error('insufficient-pool')
  // applyMark: marking index 12 is a no-op (FREE always marked; returns unchanged marks)
  // applyMark: marking the 5th cell of row 0 → newLines ['row_0']
  // applyMark: one mark completing row 2 and col 2 → newLines has both
  // applyMark: unmark then re-mark row_0 with announcedLines ['row_0'] → newLines []
  // applyMark: index outside 0..24 throws
  // generateGameCode: length 5, every char in alphabet, seeded ⇒ deterministic
  ```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** `dealBoard`: eligible = `tasks.filter(t => canBeDealt(t, seatId))`; throws `insufficient-pool` if `< 24`; `placeBoard({ items: eligible, gridSize: 5, centerType: FREE, randomize: true, rng })`; for each placed task replace every `@someone` (case-insensitive, same boundary rule as Task 3) with one name picked uniformly from seats other than `seatId` (keep text if none). Marks array always has `marks[12] = true`; `applyMark` treats index 12 as no-op, toggles otherwise, runs `detectBingos(marks, 5)`, `newLines = completedLines − announcedLines` (in detection order).
- [ ] **Step 4:** Run → PASS. Export everything from `src/index.ts`.
- [ ] **Step 5:** Commit `feat(game-core): readiness, dealing with @someone resolution, marking, game codes, schema`.

---

### Task 5: Security rules + rules tests

**Files:**
- Create: `firestore.rules` (replace placeholder), `functions/` package skeleton (`package.json`, `tsconfig.json`, `vitest.config.ts`), `functions/test/rules.test.ts`
- Modify: `.github/workflows/ci.yml` (add emulator test step)

**Interfaces:**
- Produces: `functions` package with scripts `build` (`tsc --noEmit && esbuild src/index.ts --bundle --platform=node --target=node22 --format=cjs --outfile=lib/index.js --external:firebase-admin --external:firebase-functions`), `test` (`firebase emulators:exec --only auth,firestore,functions "vitest run"`); deps `firebase-admin ^14`, `firebase-functions ^7`; devDeps `game-core: workspace:*`, `esbuild`, `typescript`, `vitest`, `@firebase/rules-unit-testing`, `firebase` (client SDK for tests), `firebase-tools`.

- [ ] **Step 1: Failing tests** (`rules.test.ts`, using `initializeTestEnvironment` with seeded data via `withSecurityRulesDisabled`): game g1 with member uid `u1→s1`, `u2→s2`, host seat `s1`; non-member `u9`.
  - `u1` can read `games/g1`, `seats/*`, `views/s1`, `boards/s1`, `members/u1`; **cannot** read `views/s2`, `boards/s2`, `members/u2`, `tasks/*`, `codes/*`.
  - `u9` cannot read `games/g1` or anything under it.
  - `u1` can query `bingos` with `where('status','==','announced')`; a query without that filter is denied.
  - `reclaims/r1` (requesterUid `u9`) readable by `u9` and by `u1` (host's member); not by `u2`.
  - Every `set`/`update`/`delete` by `u1` on every path above is denied.
- [ ] **Step 2:** Run `pnpm --filter functions test` → FAIL (placeholder rules deny reads).
- [ ] **Step 3:** Write `firestore.rules` from the layout table: helper `memberSeat(g) = get(/databases/$(database)/documents/games/$(g)/members/$(request.auth.uid)).data.seatId`; `isMember(g) = exists(.../members/$(request.auth.uid))`; host check compares `memberSeat(g)` with `get(games/g).data.hostSeatId`. `allow write: if false` everywhere.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** CI: add `npm i -g firebase-tools` + Java 21 setup + `pnpm --filter functions test` to the `ts` job. Commit `feat(rules): read-only, seat-scoped Firestore rules with emulator tests`.

---

### Task 6: Functions — `createGame`, `joinGame`

**Files:**
- Create: `functions/src/index.ts`, `functions/src/config.ts` (`setGlobalOptions({ region: 'us-central1', minInstances: defineInt('MIN_INSTANCES', { default: 0 }) })`), `functions/src/lib/{auth.ts,gameRefs.ts,errors.ts,views.ts}`, `functions/src/api/{createGame,joinGame}.ts`, `functions/test/{helpers.ts,createJoin.test.ts}`

**Interfaces:**
- Consumes: `normalizeName`, `nameKey`, `generateGameCode`, `dealBoard`, `buildPoolView`, `shortfalls`, schema types.
- Produces:
  - `requireUid(req): string` (throws `unauthenticated`); `requireMember(tx, gameId, uid): Promise<{ seatId: string; game: GameDoc }>` (throws `permission-denied`); `refs(gameId)` helpers for every path.
  - `rebuildViews(tx, gameId, tasks, seats): void` — writes every `views/{seatId}` via `buildPoolView` and `games/{g}.shortfalls` via `shortfalls`. Callers read `tasks`/`seats` inside the same transaction.
  - Test helpers: `callAs(uid, name, data)` (signs in anonymously against the auth emulator, calls the callable via client SDK `httpsCallable`), `readAdmin(path)`.
  - `whoAmI({ code }) → { gameId: string; seatId: string } | null` — lets a returning device resume without a name prompt.
  - Error codes (HttpsError `details.code`): `invalid-name`, `invalid-text`, `game-not-found`, `game-ended`, `unknown-mention`, `self-mention`, `not-host`, `wrong-stage`, `not-ready`, `invalid-cell`, `unknown-seat`.

- [ ] **Step 1: Failing tests** (`createJoin.test.ts`):
  - `createGame({ name: 'Stephen' })` → `{ gameId, code, seatId }`; `codes/{code}.gameId == gameId`; game `stage 'lobby'`, `hostSeatId == seatId`, `bingoCount 0`; caller's `members/{uid}.seatId == seatId`; `views/{seatId}.entries == []`.
  - `joinGame({ code, name: 'Cody' })` by u2 → `status 'joined'`, new seat; `views/{seat}` exists.
  - Same u2 calls `joinGame` again (any name) → `status 'resumed'`, same seatId, no new seat.
  - u3 joins as `' cody '` → `status 'reclaim-pending'`; `reclaims/{id}` `{ requesterUid: u3, seatId: <Cody's>, status: 'pending' }`; no new seat.
  - `joinGame` with lowercase code works; unknown code → `game-not-found`; name `''` → `invalid-name`.
  - Join while `stage == 'playing'` → `joined` and `boards/{seat}` exists with 25 cells (seed pool via admin with 30 tasks, stage set by admin).
  - Join while `stage == 'ended'` → `game-ended`.
  - `whoAmI({ code })`: member → `{ gameId, seatId }`; non-member → `null`; unknown code → `game-not-found`. Works in every stage (an ended game still resumes to its leaderboard).
- [ ] **Step 2:** Run `pnpm --filter functions test` → FAIL.
- [ ] **Step 3:** Implement `createGame`, `joinGame`, `whoAmI` (file `api/whoAmI.ts`) as `onCall` handlers, each body in one Firestore transaction. `createGame` retries code generation on collision (`codes/{code}` exists) up to 5 times. `joinGame`: resolve code (uppercased) → if caller already a member → `resumed`; else name normalize → name taken → create reclaim; else create seat + member, and if `playing`, `dealBoard` with a non-seeded rng and write the board with `marks` = 25 × false except index 12, `completedLines: []`, `announcedLines: []`; finally `rebuildViews`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(functions): createGame and joinGame with resume, reclaim request and late-join dealing`.

---

### Task 7: Functions — `addTask`, `deleteTask`

**Files:**
- Create: `functions/src/api/{addTask,deleteTask}.ts`, `functions/test/tasks.test.ts`

**Interfaces:**
- Consumes: Task 6 `requireMember`, `rebuildViews`; `parseMentions`.
- Produces: `addTask({ gameId, text }) → { taskId }`; `deleteTask({ gameId, taskId }) → {}`.

- [ ] **Step 1: Failing tests** (game with seats Stephen(host, s1), Cody(s2), Seth(s3)):
  - Cody adds `'@Stephen falls asleep'` → `views/s1` entry has `text: null`; `views/s2` and `views/s3` have the text; task stored with `mentions.seatIds ['s1']`.
  - Seth adds `'@someone takes a shot'` → text present only in `views/s3`; null in s1, s2.
  - Cody adds `'@Cody dances'` → `self-mention`. `'@Bob sings'` → `unknown-mention`. Text `''` or > 120 chars after trim → `invalid-text`.
  - `games.shortfalls` stays current and never stores zeros. Empty pool → `{ s1: 24, s2: 24, s3: 24 }`. After 23 plain tasks + 1 `@Cody` task (by Seth) → `{ s2: 1 }`. After one more plain task → `{}`.
  - Author deletes own task → gone from every view; non-author non-host → `permission-denied`; host deletes any.
  - Any call while `stage != 'lobby'` → `wrong-stage`.
  - **Leak check:** after the above, scan every `views/*` doc: no entry whose `text` is non-null for a viewer `canSeeText` would reject.
  - 10 concurrent `addTask` calls from 3 users → every `views/*` has all 10 entries (transaction retry, no lost update).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement: max text length 120 (add to `game-core` constants as `MAX_TASK_LENGTH = 120`); `addTask` reads game + seats + tasks in a transaction, parses, rejects self-mention (`mentions.seatIds.includes(callerSeat)`), writes task, `rebuildViews`. `deleteTask` same transaction shape.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(functions): addTask/deleteTask with per-seat pool views and shortfalls`.

---

### Task 8: Functions — `launchGame`, `toggleMark`, `endGame`

**Files:**
- Create: `functions/src/api/{launchGame,toggleMark,endGame}.ts`, `functions/test/play.test.ts`

**Interfaces:**
- Consumes: `dealBoard`, `applyMark`, `shortfalls`.
- Produces: `launchGame({ gameId }) → {}`; `toggleMark({ gameId, cellIndex }) → { marks: boolean[]; completedLines: string[]; newBingoSeqs: number[] }`; `endGame({ gameId }) → {}`.

- [ ] **Step 1: Failing tests:**
  - Non-host `launchGame` → `not-host`. With any shortfall → `not-ready` (details include the shortfalls map). Ready → stage `playing`, `launchedAt` set, every seat has a board (25 cells, center free, marks[12] true).
  - `addTask` after launch → `wrong-stage`.
  - `toggleMark` completing row 0 → one `bingos` doc `{ seq: 1, seatId, name, line: 'row_0', playerBingoNumber: 1, status: 'announced' }`; `games.bingoCount == 1`; board `announcedLines ['row_0']`.
  - Unmark + re-mark the same cell → no new bingo doc.
  - Same player's second line → `seq 2`, `playerBingoNumber 2`.
  - One mark completing two lines → two docs with consecutive seqs.
  - **Concurrency:** two players each one mark from a line, both `toggleMark` via `Promise.all` → seqs are exactly `{1, 2}`, `bingoCount == 2`.
  - `cellIndex` 25 or -1 → `invalid-cell`; index 12 → no change; `toggleMark` in `lobby` or `ended` → `wrong-stage`.
  - `endGame` non-host → `not-host`; host → `stage 'ended'`, `endedAt` set; later `toggleMark` → `wrong-stage`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement each in one transaction. `launchGame` re-reads seats + tasks and recomputes `shortfalls` inside the transaction (never trusts the stored map). `toggleMark` reads game, member, board; `applyMark`; for each new line in order: `seq = ++bingoCount`, `playerBingoNumber = announcedLines.length + 1`, write a bingo doc (`status: 'announced'`, since `reviewGate` is false in the MVP), append to `announcedLines`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(functions): launch, mark with ordered bingo announcements, end`.

---

### Task 9: Functions — `resolveReclaim`, `transferHost`

**Files:**
- Create: `functions/src/api/{resolveReclaim,transferHost}.ts`, `functions/test/host.test.ts`

**Interfaces:**
- Produces: `resolveReclaim({ gameId, reclaimId, approve: boolean }) → {}`; `transferHost({ gameId, toSeatId }) → {}`.

- [ ] **Step 1: Failing tests:**
  - Non-host → `not-host` for both.
  - Approve: `members/{requesterUid}.seatId == reclaim.seatId`; the seat's previous member doc is deleted; reclaim `status 'approved'`; requester can now read `boards/{seat}` (rules check via client SDK) and the old uid cannot.
  - Deny: reclaim `status 'denied'`; no member changes. Resolving an already-resolved reclaim → `wrong-stage`.
  - Reclaiming the **host's** seat (host lost phone, host role previously transferred to s2 who approves) → requester becomes member of that seat; `hostSeatId` unchanged (s2).
  - `transferHost` to s2 → `hostSeatId == 's2'`; old host loses host powers (`launchGame` → `not-host`); to unknown seat → `unknown-seat`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (one transaction each). **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(functions): host-approved seat reclaim and host hand-off`.

---

### Task 10: Web — scaffold, Firebase client, routing, home/join

**Files:**
- Create: `web/{package.json,vite.config.ts,tsconfig.json,index.html,.env.example,eslint.config.js}`, `web/src/{main.tsx,App.tsx}`, `web/src/styles/riso.css` (copied), `web/src/components/riso/*` (copied subset), `web/src/firebase/{app.ts,api.ts,session.ts}`, `web/src/game/{GameClient.ts,firebaseGameClient.ts,fakeGameClient.ts,useGame.ts}`, `web/src/pages/{HomePage.tsx,JoinPage.tsx,GamePage.tsx}`, tests beside each (`*.test.tsx`)
- Modify: `.github/workflows/ci.yml` (add `pnpm --filter web test` + `build`)

**Interfaces:**
- Consumes: schema + request/response types from `game-core` (types only — the web bundle must not import game logic; enforce with ESLint `no-restricted-imports` allowing only `import type` from `game-core`).
- Produces:
  ```ts
  // web/src/game/GameClient.ts
  export interface GameSnapshot {
    game: GameDoc; mySeatId: string; seats: Array<SeatDoc & { seatId: string }>;
    view: PoolViewEntry[]; board: BoardDoc | null; bingos: BingoDoc[]; reclaims: Array<ReclaimDoc & { id: string }>;
  }
  export interface GameClient {
    createGame(name: string): Promise<CreateGameRes>;
    joinGame(code: string, name: string): Promise<JoinGameRes>;
    whoAmI(code: string): Promise<{ gameId: string; seatId: string } | null>;
    subscribe(gameId: string, seatId: string, onChange: (s: GameSnapshot) => void, onError: (e: Error) => void): () => void;
    addTask(gameId: string, text: string): Promise<void>; deleteTask(gameId: string, taskId: string): Promise<void>;
    launch(gameId: string): Promise<void>; toggleMark(gameId: string, cellIndex: number): Promise<ToggleMarkRes>; end(gameId: string): Promise<void>;
    resolveReclaim(gameId: string, reclaimId: string, approve: boolean): Promise<void>; transferHost(gameId: string, toSeatId: string): Promise<void>;
    watchReclaim(gameId: string, reclaimId: string, onStatus: (s: ReclaimDoc['status']) => void): () => void;
  }
  export function useGame(client: GameClient, gameId: string, seatId: string): { snapshot: GameSnapshot | null; error: Error | null };
  ```
  `fakeGameClient.ts`: in-memory implementation for component tests.
- Env keys (`.env.example`): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_USE_EMULATORS` (`true` connects auth/firestore/functions emulators).

- [ ] **Step 1: Scaffold** Vite React-TS; deps `react`, `react-dom`, `react-router-dom`, `firebase`, `qrcode.react`; dev `vitest`, `@testing-library/react`, `jsdom`, `@playwright/test`. Copy `riso.css` from oybc `packages/riso-tokens/` and these from oybc `apps/web/src/components/riso/` (+ their `.module.css`): `RisoButton`, `RisoCard`, `RisoChip`, `RisoSectionLabel`, `RisoSegmented`, `RisoBrandMark`, `RisoIcon`; fix imports so nothing references Do code.
- [ ] **Step 2: Failing tests** (`HomePage.test.tsx`, `JoinPage.test.tsx` with `fakeGameClient`):
  - Home: "Host a game" with a name field → calls `createGame('Stephen')` → navigates to `/g/<CODE>`. "Join" with a code field → navigates to `/g/<CODE>`.
  - Join page for a code where the fake says this uid is already seated → renders the game without asking for a name.
  - Otherwise → name field; submit → `joinGame`; `reclaim-pending` → shows `"Waiting for the host"` and, when `watchReclaim` reports `approved`, renders the game; `denied` → back to the name field with error `"The host said no"`.
  - `invalid-name` / `game-not-found` / `game-ended` → inline error text.
- [ ] **Step 3:** Implement. `session.ts`: `signInAnonymously` once, with `browserLocalPersistence`. JoinPage calls `whoAmI(code)` first and skips the name prompt when it returns ids. Routes: `/` HomePage, `/g/:code` JoinPage (renders GamePage once seated). `GamePage` switches on `snapshot.game.stage` (Lobby / Play / Ended components from Tasks 11–12; placeholders now). `firebaseGameClient.subscribe` attaches `onSnapshot` listeners to game, seats, `views/{seatId}`, `boards/{seatId}`, `bingos where status == 'announced' orderBy seq`, and (if host) `reclaims where status == 'pending'`, merging into one `GameSnapshot`.
- [ ] **Step 4:** `pnpm --filter web test` → PASS; `pnpm --filter web build` → PASS.
- [ ] **Step 5:** Commit `feat(web): scaffold, Firebase client, home and join with resume and reclaim`.

---

### Task 11: Web — lobby

**Files:**
- Create: `web/src/pages/lobby/{LobbyScreen.tsx,PlayerList.tsx,PoolList.tsx,AddTaskForm.tsx,MentionAutocomplete.tsx,ShareCard.tsx,LaunchBar.tsx}` + `*.module.css`, tests `web/src/pages/lobby/*.test.tsx`

**Interfaces:**
- Consumes: `GameClient`, `GameSnapshot`.
- Produces: `<LobbyScreen client snapshot />`.

- [ ] **Step 1: Failing tests** (fake client):
  - Pool renders entries; `text: null` entries render as a blurred placeholder bar + author name and contain **no** task text in the DOM.
  - Own entries and (for the host) every entry show a delete control; others don't.
  - Typing `@co` in AddTaskForm shows `Cody` (and `someone`, `anyone`) in the autocomplete; picking inserts `@Cody `; submit calls `addTask`; server error `unknown-mention` shows `"No player named @Bob"`, `self-mention` shows `"You can't mention yourself"`.
  - Players list shows every seat; host marked.
  - ShareCard (host only) shows the code, a copyable link `${origin}/g/${code}`, and a QR of that link.
  - LaunchBar (host only): disabled with lines `"Cody needs 3 more tasks"` / `"needs 1 more task"` from `game.shortfalls` and a pool counter; enabled when `shortfalls` is empty and pool ≥ 24; tap → `launch`.
  - Non-host sees no Launch / Share-QR (they see the code only).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement, mobile-first (single column ≤ 480px; tap targets ≥ 44px), Riso components. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(web): lobby — live pool with blur, @mention input, share/QR, launch readiness`.

---

### Task 12: Web — play, bingo banner, leaderboard, end

**Files:**
- Create: `web/src/pages/play/{PlayScreen.tsx,BoardGrid.tsx,BingoBanner.tsx,useBingoBanners.ts,Leaderboard.tsx,EndedScreen.tsx}` + css, tests beside them

**Interfaces:**
- Produces: `useBingoBanners(bingos: BingoDoc[], mySeatId: string): { current: BingoDoc | null; dismiss(): void }`.

- [ ] **Step 1: Failing tests:**
  - BoardGrid renders 25 cells, center `"Free"`, marked cells styled, cells in `completedLines` highlighted; tap calls `toggleMark(i)`; the cell flips immediately (optimistic) and rolls back if the call rejects; tapping is disabled while that cell's call is in flight.
  - `useBingoBanners`: bingos present at first render produce **no** banner; a later bingo by another seat produces `"Cody got a bingo!"`; own bingo → no banner; three arriving together queue and show one after another (auto-dismiss after 4 s, tap to dismiss).
  - Leaderboard (a "Leaderboard" header button on the Play screen opens it as a sheet; the Ended screen shows it inline) lists bingos by `seq`: name, `#playerBingoNumber`, local time `h:mm`.
  - Host sees "End game" → confirm dialog → `end`.
  - Stage `ended` → EndedScreen showing the Leaderboard and the player's final board, no marking.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(web): play board, bingo banners, leaderboard, end`.

---

### Task 13: Web — host extras + end-to-end

**Files:**
- Create: `web/src/pages/host/{ReclaimPrompt.tsx,HostMenu.tsx}` + tests; `web/e2e/{playwright.config.ts,fullGame.spec.ts}`

- [ ] **Step 1: Failing component tests:** pending reclaim shows `"Cody wants back in"` with Allow / Deny → `resolveReclaim`; HostMenu lists other seats with "Make host" → confirm → `transferHost`; after transfer, host-only controls disappear for the old host.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: E2E** (`fullGame.spec.ts`, against `firebase emulators:exec` + `vite` with `VITE_USE_EMULATORS=true`; three browser contexts A host, B, C):
  1. A hosts "Stephen"; B, C open `/g/<code>` and join as Cody, Seth.
  2. B adds `"@Stephen falls asleep"` → A sees a blurred entry, C sees the text.
  3. Seed remaining tasks to 30 via the UI (loop); A launches.
  4. A marks one full row (cells chosen by reading A's board) → B and C see `"Stephen got a bingo!"`; A does not.
  5. **B reloads the page** → same board, same marks, no name prompt.
  6. New context D opens the link, joins as "Josh" → gets a board.
  7. New context E joins as `"cody"` → waiting state; A allows → E sees Cody's board with Cody's marks.
  8. A ends the game → all see the leaderboard with Stephen #1.
- [ ] **Step 6:** Run `pnpm --filter web e2e` → PASS. Add an `e2e` job to CI. Commit `feat(web): reclaim approvals, host hand-off, full-game e2e`.

---

### Task 14: Deploy + party readiness (web MVP)

- [ ] **Step 1:** `firebase deploy --only firestore:rules,firestore:indexes,functions,hosting` to the Task 0 project (indexes: `bingos (status asc, seq asc)`, `reclaims (status asc, createdAt asc)` — add to `firestore.indexes.json` if the emulator run logged index requirements).
- [ ] **Step 2: Smoke test on real phones:** Stephen + at least 2 other phones run the e2e scenario by hand on the hosted URL (scan QR from the host screen). Record pass/fail per step in `docs/SETUP.md` §Smoke test.
- [ ] **Step 3: Load check:** script `scripts/loadTest.ts` (node, client SDK, anonymous auth) joins 20 seats to a hosted test game, adds 60 tasks concurrently, launches, and fires 200 random `toggleMark`s across seats; assert every call succeeds, `bingoCount` equals the number of bingo docs, seqs are 1..n with no gaps, and median `toggleMark` latency < 800 ms (print p50/p95).
- [ ] **Step 4:** Party-day runbook in `docs/SETUP.md`: the morning of 10-31 set `MIN_INSTANCES=1` in `functions/.env.<projectId>` and `firebase deploy --only functions`; the next day set it back to `0` and redeploy. Commit `chore: deploy config, load test, party runbook`.

---

### Task 15: iOS — scaffold + services

**Files:**
- Create: `ios/project.yml`, `ios/PlayOYBC/{PlayOYBCApp.swift,Info.plist}`, `ios/PlayOYBC/Riso/{RisoTheme.swift,RisoText.swift,RisoModifiers.swift,RisoControls.swift}` (copied), `ios/PlayOYBC/Models/Schema.swift`, `ios/PlayOYBC/Services/{GameService.swift,FirebaseGameService.swift,FakeGameService.swift}`, `ios/PlayOYBC/ViewModels/GameViewModel.swift`, `ios/PlayOYBCTests/{SchemaDecodingTests.swift,GameViewModelTests.swift,BingoBannerQueueTests.swift}`
- Modify: `.github/workflows/ci.yml` (macOS job: `xcodegen generate` + `xcodebuild test`; job writes a dummy `GoogleService-Info.plist` from a template)

**Interfaces:**
- `Schema.swift`: `Codable` structs mirroring `game-core/src/schema.ts` 1:1 (`GameDoc`, `SeatDoc`, `PoolViewEntry`, `BoardCell` as an enum decoding `kind`, `BoardDoc`, `BingoDoc`, `ReclaimDoc`, request/response structs). Timestamps are `Double` ms.
- `protocol GameService` with async methods matching the web `GameClient` one-for-one, and `func subscribe(gameId: String, seatId: String) -> AsyncThrowingStream<GameSnapshot, Error>`.
- `@MainActor final class GameViewModel: ObservableObject` — `@Published snapshot`, `@Published banner: BingoDoc?`, `@Published pendingCells: Set<Int>`; `toggle(cell:)` optimistic with rollback; banner queue with the same rules as web `useBingoBanners`.
- Persisted resume: `UserDefaults` key `lastGame` = `{ code }`; on launch, call `whoAmI(code)`.

- [ ] **Step 1:** `project.yml`: target `PlayOYBC` (iOS 17, bundle id from `docs/SETUP.md`), SPM `firebase-ios-sdk` from `11.0.0` products FirebaseAuth/FirebaseFirestore/FirebaseFunctions, test target `PlayOYBCTests`. Copy the four Riso files from oybc `apps/ios/OYBC/Views/Riso/`; delete any symbol that fails to compile without Do types. Note in `CLAUDE.md`: Swift `Task` is not shadowed here (no Do model), but name any model `GameTask`, never `Task`.
- [ ] **Step 2: Failing tests:** `SchemaDecodingTests` decodes a JSON fixture of each doc (copy fixtures written from the Task 8 emulator test output into `ios/PlayOYBCTests/Fixtures/`); `GameViewModelTests` with `FakeGameService`: optimistic toggle then rollback on throw; `BingoBannerQueueTests` mirrors the web hook cases (no banner for initial bingos, none for own, queued sequence).
- [ ] **Step 3:** Run `cd ios && xcodegen generate && xcodebuild test -project PlayOYBC.xcodeproj -scheme PlayOYBC -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.3.1' -derivedDataPath /Volumes/Stephen/play-oybc-derived` → FAIL.
- [ ] **Step 4:** Implement services (anonymous sign-in at launch; Firestore listeners mirroring the web subscribe list; `Functions.functions(region: "us-central1")`; emulator wiring behind a `-useEmulators YES` launch arg). Run → PASS.
- [ ] **Step 5:** Commit `feat(ios): XcodeGen scaffold, schema, Firebase game service, view model`.

---

### Task 16: iOS — screens

**Files:**
- Create: `ios/PlayOYBC/Views/{HomeView,JoinView,LobbyView,PoolListView,AddTaskView,ShareView,PlayView,BoardGridView,BingoBannerView,LeaderboardView,EndedView,ReclaimPromptView,HostMenuView}.swift`, `ios/PlayOYBCSnapshotTests/*SnapshotTests.swift` (swift-snapshot-testing ≥ 1.18, `.fixed(width: 393, height: …)`, record `.missing`)

- [ ] **Step 1:** Failing snapshot tests for: lobby (host, with one blurred entry and a shortfall line), lobby (non-host), play board with a highlighted line and the banner, leaderboard, ended, reclaim prompt — each in light and dark.
- [ ] **Step 2:** Implement views with the same behaviour and copy as web Tasks 10–13 (QR via `CIFilter.qrCodeGenerator`; join by typed code, and by pasted `…/g/<CODE>` link). Run → baselines recorded; **read every recorded PNG** as a design review; re-run → PASS.
- [ ] **Step 3:** Relay a numbered manual test script to Stephen (iOS hosts, two web phones join, full flow incl. reclaim and hand-off). Fix what he reports.
- [ ] **Step 4:** Commit `feat(ios): lobby, play, leaderboard, host screens`.

---

### Task 17: iOS — TestFlight

- [ ] **Step 1:** Configure signing (team from App Store Connect), app icon (Riso brand mark), version 0.1.0 build 1.
- [ ] **Step 2:** Archive + upload (Xcode Organizer, or an Xcode Cloud workflow on `main` — owner's choice at this step); commit `Package.resolved` (Xcode Cloud requires it).
- [ ] **Step 3:** Stephen installs from TestFlight and runs the Task 16 script against production. Commit any fixes.

---

### Task 18: oybc cleanup PR (in `/Users/stephen/local-repos/oybc`)

Runs any time after Task 2 and Task 10 Step 1 (assets copied). Branch `chore/remove-play` from `dev`.

- [ ] **Step 1:** Delete `apps/play/`, `.github/workflows/play.yml`, `functions/src/validateWin.ts`, `functions/test/validateWin.test.ts`, the `validateWin` export in `functions/src/index.ts`, `docs/PLAY_TRANSITION.md`, `docs/play/`.
- [ ] **Step 2:** Edit Play out of: `.github/dependabot.yml`, `codeql.yml`, `web.yml`, `functions.yml` path filters; root `CLAUDE.md` ("Two products, one repo" section, the Play row in Documentation, any `apps/play` mention); `docs/ROADMAP.md` Track G → one line "Play OYBC moved to its own repo (`2014sheas/play-oybc`) on 2026-10-22"; `packages/bingo-core/{CLAUDE.md,MIRRORS.md,package.json description}` and `packages/riso-tokens/package.json` description (drop "shared with Play"); `.claude/skills/audit/SKILL.md`, `.design-sync/*`, `apps/coming-soon/README.md`, and every other hit of `grep -rn "apps/play\|Play OYBC\|validateWin\|play\.yml" --exclude-dir=node_modules --exclude-dir=.git` (historical mentions in shipped-feature docs may stay if they're accurate history).
- [ ] **Step 3:** `functions/`: keep the esbuild build and the `@oybc/bingo-core` dev-dependency only if any remaining `functions/src` file imports it (`grep -rn bingo-core functions/src`); otherwise remove both and restore `"build": "tsc"` and update `functions/package-lock.json`.
- [ ] **Step 4:** `pnpm install && pnpm build && pnpm test`, `cd functions && npm run build && npm run test:run`, `node scripts/check-file-sizes.mjs`, `node scripts/check-knip.mjs` → all PASS. If `validateWin` exists in `oybc-dev-e2668` (`firebase functions:list`), ask Stephen before `firebase functions:delete validateWin`.
- [ ] **Step 5:** Commit, `git push origin HEAD:chore/remove-play`, open the PR to `dev` (rule-6 note: removal of a separate product, no Do behavior change), run the internal review, merge after CI.

---

### Task 19 (stretch): Host review gate

Only after Tasks 0–17 pass. Spec `DESIGN.md` §4.6.

**Files:** `functions/src/api/{setReviewGate,reviewBingo}.ts`, `functions/test/review.test.ts`, `firestore.rules` (host can read pending bingos and `reviews/*`), web `pages/host/ReviewQueue.tsx`, iOS `ReviewQueueView.swift`, tests on each.

- [ ] **Step 1: Failing tests:** with `reviewGate: true`, a new line writes a bingo doc `status: 'pending'` with **no** `seq` and is invisible to non-hosts; `reviewBingo(approve)` assigns `seq = ++bingoCount`, sets `announced`; reject → `rejected`, line stays in `announcedLines` (no re-announce); host review payload blurs (text `null`) cells whose task `@`-mentions the host; rules let the host read the pending player's board only through a server-written `reviews/{bingoId}` doc (board snapshot with blurring applied) — never the raw board.
- [ ] **Step 2–4:** implement functions → web → iOS; tests PASS on each.
- [ ] **Step 5:** Commit `feat: host review gate for bingos`.
