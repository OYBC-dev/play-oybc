# Realtime Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Cloud Functions + Firestore game backend with one Cloudflare Durable Object per game that phones stay connected to over WebSockets, keeping every rule, both clients' public seams and the existing tests' behaviour.

**Architecture:** A Worker routes `POST /api/createGame`, `GET /ws/:code` and `/admin/:code/*` to a `GameRoom` Durable Object keyed by join code. The object holds the game in memory, writes through to its SQLite storage, applies the existing `game-core` rules, and pushes per-seat snapshot *sections* to attached sockets. Web and iOS get a second `GameClient` / `GameService` implementation over one reconnecting socket; the UI does not change.

**Tech Stack:** Cloudflare Workers + Durable Objects (SQLite, WebSocket Hibernation), `wrangler` 4, `jose`, `@cloudflare/vitest-pool-workers`; TypeScript everywhere server-side; `game-core` unchanged; React/Vite web; SwiftUI + `URLSessionWebSocketTask` iOS; Firebase Auth (unchanged) for identity.

**Spec:** `docs/REALTIME_SERVER.md` (approved; §13 rulings apply).

## Global Constraints

- Working tree: `/Volumes/Stephen/play-oybc`, branch `feature/realtime-server`. Never commit to `dev`; never deploy hosting to the live site; never upload to TestFlight (archive only; the owner decides).
- Every `xcodebuild` uses `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer -derivedDataPath /Volumes/Stephen/play-oybc-derived -clonedSourcePackagesDirPath /Volumes/Stephen/play-oybc-spm`; logs go under `/private/tmp/claude-501/-Users-stephen-local-repos-oybc/66a5c77b-e87d-48af-8c23-af432d830f6f/scratchpad/`, never `/tmp`; check `df -h /` shows ≥ 10 GB free before an iOS run.
- `packages/game-core` is not modified. Its exports are consumed as-is: `normalizeName`, `nameKey`, `parseMentions`, `shortfalls`, `buildPoolView`, `canBeDealt`, `dealBoard`, `applyMark`, `generateGameCode`, the `schema.ts` types, `TASKS_PER_BOARD = 24`, `MAX_TASK_LENGTH = 120`, `RECLAIM_RETRY_COOLDOWN_MS = 60_000`.
- App error codes are exactly today's union plus the plain codes some handlers already throw: `invalid-name, invalid-text, game-not-found, game-ended, unknown-mention, self-mention, not-host, wrong-stage, not-ready, invalid-cell, unknown-seat, reclaim-not-found, reclaim-cooldown` and `unauthenticated, permission-denied, not-found, invalid-argument, resource-exhausted`. Clients read `details.code` (web) / `AppError.code` (iOS) exactly as today.
- Close codes: 4001 bad token · 4003 evicted · 4004 game not found · 4008 rate limited · 4013 payload too large.
- Caps: 50 seats, 500 live tasks, 64 KB frame, 100 sockets per game, 20 actions/s per socket (burst 40). Purge: `ended` + 7 days, or 30 days without a mutation.
- No UI copy changes; no new user-facing sentences (owner rule). The one UI-adjacent change is optimistic pending rows for task add/delete.
- Commit messages end with the two trailer lines from the session (`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and the `Claude-Session:` link). Push with `git push origin HEAD:feature/realtime-server` and verify `git rev-parse HEAD` == `origin/feature/realtime-server`.
- Node 24 locally, 22 in CI; pnpm 9.15.4 (`packageManager`). Add `server` to `pnpm-workspace.yaml`.

## Review Focus

1. A tap whose `ack` never arrives because the socket dropped: the square reverts and the user re-taps; it is never applied twice and never silently lost while the UI shows it marked. — Task 7 (`RoomConnection` rejects unacked in-flight acts with `offline` on close; `BoardGrid` already reverts on error) and Task 10 (iOS overlay).
2. One sign-in with two sockets (phone and web, same uid): both receive every `state`, both are evicted on an approved reclaim, and a tap on one shows on the other within one push. — Task 5 (`room.test.ts: two sockets one uid`).
3. A phone returns to a code whose game was purged and reused by someone else: it receives `game-not-found`, never a stranger's game. — Task 5 (`hello gameId mismatch → 4004`) and Task 3 (`claim` after purge mints a new gameId).
4. Redaction on a reconnect full `state` is identical to incremental pushes: a mentioned player never sees hidden text in either path. — Task 2 (`buildSections` is the only producer) and Task 5 (`hello after addTask returns redacted view`).
5. Host transfer while a reclaim is pending: the new host's sockets start receiving `reclaims`, the old host's stop, and resolving still works. — Task 4 (`transferHost` moves pending reclaims visibility) and Task 5 (`reclaims section follows hostSeatId`).

---

### Task 1: Server scaffold, auth, health

**Files:**
- Create: `server/package.json`, `server/wrangler.jsonc`, `server/tsconfig.json`, `server/vitest.config.ts`, `server/.dev.vars`, `server/.gitignore`
- Create: `server/src/index.ts`, `server/src/auth.ts`, `server/src/errors.ts`, `server/src/protocol.ts`
- Create: `server/test/auth.test.ts`
- Modify: `pnpm-workspace.yaml` (add `"server"`)

**Interfaces:**
- Produces `server/src/auth.ts`: `verifyIdToken(token: string, env: Env): Promise<{ uid: string }>` — `env.AUTH_MODE === 'firebase'` verifies RS256 against `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com` with issuer `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}` and audience `env.FIREBASE_PROJECT_ID` (jose `createRemoteJWKSet` cached at module scope, `cooldownDuration` default, `cacheMaxAge` 24 h); `env.AUTH_MODE === 'emulator'` uses jose `decodeJwt` and checks `aud` and `iss` only. Throws `AppError('unauthenticated')` on any failure.
- Produces `server/src/errors.ts`: `type AppErrorCode = <the union in Global Constraints>`; `class AppError extends Error { constructor(code: AppErrorCode, details?: Record<string, unknown>) }` with `code` and `details` fields; `toAck(id: string, e: unknown): AckMsg` (unknown errors become `code: 'unknown'`, never leak messages).
- Produces `server/src/protocol.ts` (verbatim):

```ts
import type { BingoDoc, BoardDoc, GameDoc, PoolViewEntry, ReclaimDoc, SeatDoc, Stage } from 'game-core';
export type Section = 'game' | 'seats' | 'view' | 'board' | 'bingos' | 'reclaims';
export type Op = 'join' | 'addTask' | 'deleteTask' | 'launch' | 'mark' | 'end' | 'resolveReclaim' | 'transferHost';
export type ClientMsg =
  | { t: 'hello'; token: string; gameId?: string }
  | { t: 'act'; id: string; op: Op; args: Record<string, unknown> };
export interface StateMsg {
  t: 'state'; rev: number; game?: GameDoc; seats?: Array<SeatDoc & { seatId: string }>; view?: PoolViewEntry[];
  board?: BoardDoc | null; bingos?: BingoDoc[]; reclaims?: Array<ReclaimDoc & { id: string }>;
}
export type AckMsg = { t: 'ack'; id: string; ok: true; result: unknown } | { t: 'ack'; id: string; ok: false; code: string; details?: Record<string, unknown> };
export type ServerMsg =
  | { t: 'welcome'; uid: string; gameId: string; seatId: string | null; stage: Stage; rev: number }
  | StateMsg | AckMsg
  | { t: 'reclaim'; id: string; status: ReclaimDoc['status'] }
  | { t: 'evicted'; reason: 'replaced' }
  | { t: 'error'; code: string };
export const CLOSE = { BAD_TOKEN: 4001, EVICTED: 4003, NOT_FOUND: 4004, RATE_LIMITED: 4008, TOO_LARGE: 4013 } as const;
export const MAX_FRAME_BYTES = 64 * 1024;
```
- Produces `server/src/index.ts`: `export interface Env { GAME_ROOM: DurableObjectNamespace; FIREBASE_PROJECT_ID: string; AUTH_MODE: 'firebase' | 'emulator'; ADMIN_TOKEN?: string }`, a `fetch` with `GET /health` → `200 "ok"` and `404` otherwise (routes grow in Task 5), and `export { GameRoom }` from a stub class `server/src/room/GameRoom.ts` whose `fetch` returns 501 (replaced in Task 5).

- [ ] **Step 1: Scaffold**

`server/package.json`: name `server`, `"type": "module"`, scripts `dev: wrangler dev`, `deploy: wrangler deploy`, `test: vitest run`, `typecheck: tsc --noEmit`, `lint: tsc --noEmit`, `build: tsc --noEmit`; dependencies `jose ^6`, `game-core workspace:*`; devDependencies `wrangler ^4`, `@cloudflare/workers-types ^4`, `@cloudflare/vitest-pool-workers ^0.8`, `vitest` (the version the pool's peer range requires), `typescript ^6.0.3`.
`server/wrangler.jsonc`: `name: play-oybc-api`, `main: src/index.ts`, `compatibility_date: 2026-10-01`, `vars: { FIREBASE_PROJECT_ID: 'play-oybc', AUTH_MODE: 'firebase' }`, `durable_objects.bindings: [{ name: 'GAME_ROOM', class_name: 'GameRoom' }]`, `migrations: [{ tag: 'v1', new_sqlite_classes: ['GameRoom'] }]`, `observability: { enabled: true }`.
`server/.dev.vars`: `AUTH_MODE=emulator` and `FIREBASE_PROJECT_ID=demo-play-oybc` (wrangler dev only; committed, not secret).
`server/vitest.config.ts`: `defineWorkersConfig` with `poolOptions.workers.wrangler.configPath = './wrangler.jsonc'` and `miniflare.bindings = { AUTH_MODE: 'emulator', FIREBASE_PROJECT_ID: 'demo-play-oybc', ADMIN_TOKEN: 'test-admin' }`.
`server/.gitignore`: `.wrangler`, `node_modules`. Add `"server"` to `pnpm-workspace.yaml`; `pnpm install`.

- [ ] **Step 2: Write the failing auth tests** (`server/test/auth.test.ts`)

```ts
it('emulator mode accepts an unsigned token with the right aud/iss', async () => {
  const token = unsignedJwt({ sub: 'u1', aud: 'demo-play-oybc', iss: 'https://securetoken.google.com/demo-play-oybc' });
  expect(await verifyIdToken(token, env)).toEqual({ uid: 'u1' });
});
it('emulator mode rejects a wrong audience', async () => { /* aud: 'other' → rejects AppError code 'unauthenticated' */ });
it('firebase mode rejects an unsigned token', async () => { /* { ...env, AUTH_MODE: 'firebase' } → rejects 'unauthenticated' without a network call */ });
it('GET /health answers ok', async () => { const r = await SELF.fetch('http://x/health'); expect(r.status).toBe(200); });
```
`unsignedJwt(payload)` is a test helper: base64url `{"alg":"none","typ":"JWT"}` + payload + empty signature.

- [ ] **Step 3: Run tests to verify they fail** — `pnpm --filter server test` → FAIL (modules missing).
- [ ] **Step 4: Implement `auth.ts`, `errors.ts`, `protocol.ts`, `index.ts` as specified.**
- [ ] **Step 5: Run tests** — `pnpm --filter server test` → PASS; `pnpm --filter server typecheck` → clean.
- [ ] **Step 6: Commit** — `git add server pnpm-workspace.yaml pnpm-lock.yaml && git commit -m "feat(server): scaffold Worker, Firebase token verification, health route"`.

---

### Task 2: Game state, persistence, snapshot sections

**Files:**
- Create: `server/src/room/state.ts`, `server/src/room/persistence.ts`, `server/src/room/sections.ts`
- Create: `server/test/state.test.ts`, `server/test/sections.test.ts`

**Interfaces:**
- Produces `server/src/room/state.ts` (rows mirror `game-core` schema; JSON columns parsed on load):

```ts
export interface GameRow { gameId: string; code: string; stage: Stage; hostSeatId: string; createdAt: number; launchedAt?: number; endedAt?: number; bingoCount: number; reviewGate: boolean; rev: number; lastMutationAt: number }
export interface SeatRow { seatId: string; name: string; nameKey: string; joinedAt: number }
export interface TaskRow { taskId: string; text: string; authorSeatId: string; mentions: TaskMentions; createdAt: number }
export interface BoardRow { seatId: string; cells: BoardCell[]; marks: boolean[]; completedLines: string[]; announcedLines: string[] }
export interface BingoRow extends BingoDoc { id: string }
export interface ReclaimRow extends ReclaimDoc { id: string }
export class GameState {
  game: GameRow | null; seats: Map<string, SeatRow>; members: Map<string, string> /* uid → seatId */;
  tasks: Map<string, TaskRow>; boards: Map<string, BoardRow>; bingos: BingoRow[]; reclaims: Map<string, ReclaimRow>;
  constructor(private p: Persistence)                 // loads everything from p
  // write-through mutators (memory + p in one call; each bumps game.rev and lastMutationAt except putMember/deleteMember)
  putGame(g: GameRow): void; putSeat(s: SeatRow): void; putMember(uid: string, seatId: string): void; deleteMember(uid: string): void;
  putTask(t: TaskRow): void; deleteTask(taskId: string): void; putBoard(b: BoardRow): void; appendBingo(b: BingoRow): void;
  putReclaim(r: ReclaimRow): void; purge(): void;
  // derived
  seatList(): Seat[]; poolTasks(): PoolTask[]; seatOf(uid: string): string | null; isHost(uid: string): boolean;
}
```
- Produces `server/src/room/persistence.ts`: `interface Persistence { load(): Loaded; putGame; putSeat; putMember; deleteMember; putTask; deleteTask; putBoard; appendBingo; putReclaim; purge }` with `class SqlPersistence implements Persistence { constructor(sql: SqlStorage) }` (runs the DDL `CREATE TABLE IF NOT EXISTS` for `game, seats, members, tasks, boards, bingos, reclaims` with the columns of the rows above; JSON columns as TEXT) and `class MemoryPersistence implements Persistence` for tests.
- Produces `server/src/room/sections.ts`: `buildSections(state: GameState, seatId: string | null, sections: readonly Section[]): Partial<StateMsg>` — `game` = `GameDoc` with `shortfalls: shortfalls(state.poolTasks(), state.seatList())` and the `GameRow` fields minus `rev/lastMutationAt`; `seats` = all seats sorted by `joinedAt`; `view` = `buildPoolView(tasks, seats, seatId)` (`[]` when `seatId` null); `board` = the seat's `BoardRow` minus `seatId`, or `null`; `bingos` = `status === 'announced'` sorted by `seq`; `reclaims` = `status === 'pending'` sorted by `createdAt` **only when `seatId === game.hostSeatId`**, else `[]`. `ALL_SECTIONS: readonly Section[]`.

- [ ] **Step 1: Failing tests** (`state.test.ts` over `MemoryPersistence`; `sections.test.ts`)

```ts
it('putTask then reload returns the task with parsed mentions', ...)   // new GameState(samePersistence) sees it
it('putTask bumps rev once; putMember does not', ...)
it('purge empties every table and game becomes null', ...)
it('view hides text from a mentioned seat and shows it to others', ...) // seat B mentioned by @B: view for B has text null, for C has text
it('reclaims section is empty for a non-host seat', ...)
it('board is null for a seat without a board', ...)
```
- [ ] **Step 2: Run** — FAIL (modules missing).
- [ ] **Step 3: Implement** `state.ts`, `persistence.ts` (both classes), `sections.ts`.
- [ ] **Step 4: Run** — PASS; add one `SqlPersistence` test in `state.test.ts` using a real object's `ctx.storage.sql` via `runInDurableObject` from `cloudflare:test` (the stub `GameRoom` suffices): `it('SqlPersistence round-trips a board', ...)`.
- [ ] **Step 5: Commit** — `feat(server): in-memory game state with SQLite write-through and per-seat sections`.

---

### Task 3: Operations — create, join, addTask, deleteTask

**Files:**
- Create: `server/src/room/ops.ts`, `server/test/opsLobby.test.ts`

**Interfaces:**
- Produces `server/src/room/ops.ts`:

```ts
export interface OpCtx { uid: string; now: number; rng: () => number; newId: () => string }
export interface Push { all: Section[]; perSeat?: Record<string, Section[]>; evictUids?: string[]; reclaimNotify?: Array<{ uid: string; id: string; status: ReclaimDoc['status'] }> }
export interface OpOut<T> { result: T; push: Push }
export function claimGame(state: GameState, ctx: OpCtx, args: { gameId: string; code: string; name: string }): OpOut<CreateGameRes>
export function join(state: GameState, ctx: OpCtx, args: { name: string }): OpOut<JoinGameRes>
export function addTask(state: GameState, ctx: OpCtx, args: { taskId: string; text: string }): OpOut<AddTaskRes>
export function deleteTask(state: GameState, ctx: OpCtx, args: { taskId: string }): OpOut<Record<string, never>>
```
Rules (port of `functions/src/api/{createGame,joinGame,addTask,deleteTask}.ts`, read them):
- `claimGame`: throws `AppError('resource-exhausted')` if `state.game` is non-null (the Worker retries with a new code); `normalizeName` null → `invalid-name`; writes game (`stage 'lobby'`, `bingoCount 0`, `reviewGate false`, `hostSeatId = newId()`), seat, member. Push `all: ['game','seats','view']`.
- `join`: existing member → `{status:'resumed'}` (any stage, no name check); `stage === 'ended'` → `game-ended`; `invalid-name`; `nameKey` collision → pending reclaim by this uid → `reclaim-pending`; denied `< RECLAIM_RETRY_COOLDOWN_MS` ago (`resolvedAt ?? createdAt`) → `reclaim-cooldown`; else create reclaim `pending` → `{status:'reclaim-pending', reclaimId}` with `push.perSeat[hostSeatId] = ['reclaims']`; new seat: cap 50 → `resource-exhausted`; if `stage === 'playing'` deal with `dealBoard` (`insufficient-pool` → `not-ready`); write seat + member (+ board); push `all: ['game','seats','view']` plus `perSeat[newSeat] = ['board']` when dealt.
- `addTask`: member required (`permission-denied`), `lobby` else `wrong-stage`, trimmed text empty or `> MAX_TASK_LENGTH` → `invalid-text`, cap 500 → `resource-exhausted`, `parseMentions` unknown → `unknown-mention` with `details.token`, self → `self-mention`; **idempotent**: an existing task with the same `taskId` and the same author returns `{taskId}` with an empty push. Push `all: ['game','view']`.
- `deleteTask`: member, `lobby`, missing → `not-found`, author or host else `permission-denied`; push `all: ['game','view']`.
- Throw `AppError('not-found', { code: 'game-not-found' })`? No: when `state.game` is null every op throws `AppError('game-not-found')`.

- [ ] **Step 1: Failing tests** — port every `it(` in `functions/test/createJoin.test.ts` and `functions/test/tasks.test.ts` (22 cases) to `opsLobby.test.ts` over `new GameState(new MemoryPersistence())` with a fixed `OpCtx` (`now: 1_700_000_000_000`, seeded `rng`, counter `newId`). Keep each test's name and assertion; translate "callAs(user, fn, data)" to "op(state, ctxFor(user), args)". Add: `it('addTask with a repeated taskId by the same author is a no-op', ...)`, `it('join as the 51st seat is resource-exhausted', ...)`, `it('claimGame on an occupied object is resource-exhausted', ...)`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the four ops.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat(server): lobby operations (claim, join, addTask, deleteTask) with ported rules`.

---

### Task 4: Operations — launch, mark, end, resolveReclaim, transferHost, admin

**Files:**
- Modify: `server/src/room/ops.ts`
- Create: `server/test/opsPlay.test.ts`

**Interfaces:**
- Produces (same module):

```ts
export function launch(state, ctx, args: Record<string, never>): OpOut<Record<string, never>>
export function mark(state, ctx, args: { cellIndex: number; marked?: boolean }): OpOut<ToggleMarkRes>
export function end(state, ctx, args: Record<string, never>): OpOut<Record<string, never>>
export function resolveReclaim(state, ctx, args: { reclaimId: string; approve: boolean }): OpOut<Record<string, never>>
export function transferHost(state, ctx, args: { toSeatId: string }): OpOut<Record<string, never>>
export function adminTransferHost(state, ctx: { now: number }, args: { seatId: string }): OpOut<Record<string, never>>  // no host check
export function adminSeats(state): Array<{ seatId: string; name: string; occupied: boolean; host: boolean }>
export const OPS: Record<Op, (state: GameState, ctx: OpCtx, args: any) => OpOut<unknown>>
```
Rules (port of `functions/src/api/{launchGame,toggleMark,endGame,resolveReclaim,transferHost}.ts`, read them):
- `launch`: host else `not-host`; `lobby` else `wrong-stage`; `shortfalls` non-empty → `not-ready` with `details.shortfalls`; deal every seat; `stage 'playing'`, `launchedAt`; push `all: ['game']` and `perSeat[every seat] = ['board']`.
- `mark`: integer 0..24 else `invalid-cell`; `marked` boolean or absent else `invalid-cell`; member; `playing` and board present else `wrong-stage`; `applyMark`; unchanged with `marked` given → return current, empty push; each new line → `appendBingo` with `seq = ++bingoCount`, `playerBingoNumber = announcedLines.length + 1`, `status 'announced'`; push `perSeat[seat] = ['board']` and, when any new line, `all: ['bingos','game']`.
- `end`: host, `playing` else `wrong-stage`; `stage 'ended'`, `endedAt`; push `all: ['game']`.
- `resolveReclaim`: host (`not-host`), reclaim missing → `reclaim-not-found`, not pending → `wrong-stage`; deny → `denied` + `resolvedAt`, `reclaimNotify` the requester; approve: requester already a member or seat is the host's → commit `denied` then throw `wrong-stage`; else `evictUids` = every uid mapped to that seat, `deleteMember` each, `putMember(requester, seatId)`, reclaim `approved`, other pending reclaims for the seat `denied` (notify each); push `perSeat[host] = ['reclaims']`, `perSeat[seatId] = ALL_SECTIONS` (the new holder needs everything).
- `transferHost`: host; seat exists else `unknown-seat`; any stage; set `hostSeatId`; push `all: ['game']` and `perSeat[old host] = ['reclaims']`, `perSeat[new host] = ['reclaims']`.
- `adminTransferHost`: `unknown-seat` if missing; otherwise as `transferHost` without the host check.

- [ ] **Step 1: Failing tests** — port every `it(` in `functions/test/host.test.ts` and `functions/test/play.test.ts` (31 cases) to `opsPlay.test.ts`. Add: `it('transferHost moves the reclaims section: push names old and new host', ...)`, `it('approve evicts every uid holding the seat', ...)` (two uids mapped to one seat via `putMember`), `it('adminTransferHost ignores who the caller is', ...)`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat(server): play operations, reclaim resolution, host transfer, admin transfer`.

---

### Task 5: GameRoom object and Worker routes

**Files:**
- Modify: `server/src/room/GameRoom.ts` (replace the stub), `server/src/index.ts`
- Create: `server/src/room/sockets.ts`, `server/src/room/limits.ts`
- Create: `server/test/room.test.ts`, `server/test/worker.test.ts`

**Interfaces:**
- `GameRoom` (DO, `implements DurableObject`): constructor runs `blockConcurrencyWhile(load)`, sets `setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'))`; `fetch(req)` handles: `Upgrade: websocket` → accept via `ctx.acceptWebSocket`; `POST /internal/claim` (JSON `{gameId, code, uid, name}`) → `claimGame` → `200 {seatId}` / `409` when occupied / `400 {code}` on AppError; `GET /internal/admin/seats` → `adminSeats`; `POST /internal/admin/transferHost {seatId}` → `adminTransferHost`; `alarm()` → purge when `stage==='ended' && now - endedAt ≥ 7d` or `now - lastMutationAt ≥ 30d`, else re-arm at the earlier of those instants. After every successful mutation: `storage.setAlarm(nextPurgeAt)`.
- `webSocketMessage(ws, raw)`: size check → `CLOSE.TOO_LARGE`; JSON parse failure → `error{code:'invalid-argument'}`; `hello` → `verifyIdToken`, on failure `error{code:'unauthenticated'}` + close 4001; if `state.game` null or `args.gameId` present and ≠ `game.gameId` → `error{code:'game-not-found'}` + close 4004; else `ws.serializeAttachment({ uid, seatId: state.seatOf(uid) })`, send `welcome`, and if seated send full `state` (`ALL_SECTIONS`). `act` → attachment required (else close 4001), per-socket rate limit (`limits.ts`, token bucket 20/s burst 40 → close 4008), run `OPS[op]` inside `try` with `ctx = { uid, now: Date.now(), rng: Math.random, newId: crypto.randomUUID }`, send `ack`, then `broadcast(push)`.
- `sockets.ts`: `attachmentOf(ws)`, `socketsFor(uid)`, `socketsForSeat(seatId)`, `broadcast(state, push, rev)`: for each attached socket compute its seat from the attachment **refreshed from `state.members`** (a seat may have changed hands), union `push.all` with `push.perSeat[seat]`, send `buildSections` for that set with `rev`; for `push.evictUids` send `evicted{reason:'replaced'}` then `close(4003)`; for `push.reclaimNotify` send `reclaim` to `socketsFor(uid)`. Sockets with no attachment receive nothing.
- Worker `index.ts`: `GET /health`; `GET /ws/:code` (regex `^[A-Z0-9]{5}$`, uppercased) → stub `fetch`; `POST /api/createGame` → `Authorization: Bearer` → `verifyIdToken` → `{name}` → up to 5 × (`generateGameCode()`, stub `/internal/claim`; `409` → retry) → `200 {gameId, code, seatId}` or `429 {code:'resource-exhausted'}` / `400 {code}`; `GET|POST /admin/:code/(seats|transferHost)` → `Authorization: Bearer <env.ADMIN_TOKEN>` constant-time compare else `401` → forwarded to `/internal/admin/*`. Rate limits: try the Workers rate-limit binding (`unsafe.bindings` `ratelimit`, `createGame` 10/min and `/ws` upgrades 60/min per `CF-Connecting-IP`); if `wrangler deploy --dry-run` rejects the binding on this account, implement `RateLimiter` as a second small DO keyed by IP and note it in the report.

- [ ] **Step 1: Failing tests** — `room.test.ts` drives the real object through `SELF.fetch` WebSocket upgrades with a `wsClient(code, uid)` helper (sends `hello` with an emulator-mode unsigned token, collects frames, `act(op,args)` resolves on its `ack`):

```ts
it('createGame then hello seats the host with a full state', ...)       // welcome.seatId set; first state has game, seats, view, board:null, bingos, reclaims
it('hello on an unknown code closes 4004', ...)
it('hello with a stale gameId closes 4004', ...)
it('a frame before hello closes 4001', ...)
it('addTask pushes view to every seat with correct redaction', ...)   // A mentions @B; B's view has text null, C's has text; A's ack result {taskId}
it('hello after addTask returns the same redacted view as the push', ...)  // Review Focus 4
it('mark pushes board only to the marker; a bingo pushes bingos+game to all', ...)
it('two sockets one uid both get state and are both evicted on approve', ...)   // Review Focus 2
it('reclaim: requester gets reclaim{status} and host gets reclaims section', ...)
it('reclaims section follows hostSeatId after transferHost', ...)      // Review Focus 5
it('21 acts in one second closes 4008', ...)
it('a 70 KB frame closes 4013', ...)
it('alarm purges an ended game after 7 days and a later hello closes 4004', ...)  // use runInDurableObject + a mocked Date.now
```
`worker.test.ts`: `it('POST /api/createGame without a token is 401', ...)`, `it('POST /api/createGame returns code and seat; a second claim on the same code is 409', ...)`, `it('/admin without the token is 401; with it lists seats', ...)`, `it('admin transferHost moves the host', ...)`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** `GameRoom.ts`, `sockets.ts`, `limits.ts`, the Worker routes. **Step 4: Run** — PASS; `pnpm --filter server typecheck` clean.
- [ ] **Step 5: Commit** — `feat(server): GameRoom Durable Object — sockets, pushes, eviction, purge alarm, Worker routes`.

---

### Task 6: Deploy, admin script, load test

**Files:**
- Modify: `scripts/forceHost.ts` (rewrite), `scripts/loadTest.ts` (rewrite), `scripts/package.json` (drop `firebase-admin`; keep `firebase`)
- Create: `scripts/wsClient.ts` (shared by both scripts: `connect(base, code, token)` → `{ hello, act, frames, close }`)

- [ ] **Step 1: Deploy** — `cd server && npx wrangler deploy` (account already logged in; subdomain `oybc`). Expect `https://play-oybc-api.oybc.workers.dev`. A new hostname's TLS can take ~3 minutes: poll `GET /health` until 200.
- [ ] **Step 2: Secret** — `openssl rand -hex 32 | npx wrangler secret put ADMIN_TOKEN` and save the value in `/Volumes/Stephen/play-oybc/.setup-secrets/ADMIN_TOKEN` (gitignored; create the dir if missing). `scripts/forceHost.ts` reads `PLAY_ADMIN_TOKEN` env or that file; usage unchanged: `forceHost <CODE>` lists seats, `forceHost <CODE> <seatId>` transfers; base URL `PLAY_API_URL` default `https://play-oybc-api.oybc.workers.dev`.
- [ ] **Step 3: Load test** — rewrite with the same assertions as today (20 seats, 60 tasks concurrently, launch, 200 `mark` with 5 seats forced to complete row 0; PASS requires `failed === 0`, `bingoCount ≥ 5`, bingo `seq` values `1..n` contiguous, `seq`s equal to the count of `bingos` entries received in the host's final `state`) and **p50 `mark` ack < 150 ms**. Run: `pnpm --filter scripts load` against the deployed Worker; paste the summary line in the report.
- [ ] **Step 4: Admin smoke** — `pnpm --filter scripts forceHost <code from the load test>` lists 20 seats; transfer to one; the host's socket (reconnect with the load test's helper) sees `hostSeatId` changed.
- [ ] **Step 5: Commit** — `feat(scripts): WebSocket load test and admin host transfer against the Worker`.

---

### Task 7: Web client over WebSocket

**Files:**
- Create: `web/src/game/roomConnection.ts`, `web/src/game/wsGameClient.ts`, `web/src/game/roomConnection.test.ts`, `web/src/game/wsGameClient.test.ts`
- Modify: `web/src/App.tsx` (provide `wsGameClient` instead of `firebaseGameClient`), `web/src/firebase/app.ts` (keep; Firestore/functions init removed in the cleanup PR, not now), `web/.env.example` (+ `VITE_GAME_SERVER_URL`), `web/src/pages/lobby/*` (optimistic pending rows — see Step 5)

**Interfaces:**
- Consumes `GameClient` (`web/src/game/GameClient.ts`) and `appError` shape `Error & { details: { code } }` (as `fakeGameClient.ts` builds it).
- Produces `roomConnection.ts`:

```ts
export interface RoomOptions { url: string; code: string; getToken: () => Promise<string>; WebSocketImpl?: typeof WebSocket; now?: () => number; setTimeoutImpl?; clearTimeoutImpl? }
export type RoomStatus = 'idle' | 'connecting' | 'authenticating' | 'ready' | 'closed';
export class RoomConnection {
  constructor(opts: RoomOptions)
  readonly status: RoomStatus
  hello(gameId?: string): Promise<Welcome>                // (re)sends hello on the current socket; resolves on welcome; rejects AppError on error/close 4004
  act<T>(op: Op, args: Record<string, unknown>): Promise<T>   // queued while not ready (10 s → AppError('offline')); rejects AppError(code, details) on !ok ack
  onSnapshot(cb: (s: GameSnapshot) => void): () => void  // emits after every state frame once game, seats, view, bingos present (board may be null; reclaims default [])
  onReclaim(id: string, cb: (status) => void): () => void
  onFatal(cb: (e: Error) => void): () => void            // 4003 → appError('permission-denied'); 4004 → appError('game-not-found')
  close(): void
}
export function getRoom(opts: RoomOptions): RoomConnection   // module-level registry keyed by code (one socket per code per tab)
```
Behaviour: backoff 0.5 s ×2 up to 8 s with ±20 % jitter; reconnect on `close` (except 4001/4003/4004 and `close()`), on `visibilitychange` → visible and `online`; after reconnect re-send `hello` with the stored `gameId`, re-emit the full state; `ping` every 25 s, missing `pong` for 10 s ⇒ `ws.close()` and reconnect; in-flight acts (sent, unacked) are rejected with `AppError('offline')` on close; queued-unsent acts survive a reconnect; state frames with `rev` ≤ last applied are dropped.
- Produces `wsGameClient.ts`: `createWsGameClient(url: string): GameClient` — `createGame` → `POST ${httpUrl}/api/createGame` with `Authorization: Bearer <token>` (`ws(s)://` → `http(s)://`), non-2xx → `appError(body.code)`; `joinGame(code,name)` → `getRoom(code).act('join',{name})`; `whoAmI(code)` → `hello()` → `{gameId, seatId}` or `null`; `subscribe(gameId, seatId, onChange, onError)` → `onSnapshot` + `onFatal`, returns unsubscribe (does **not** close the room); `addTask` → `act('addTask', { taskId: crypto.randomUUID(), text })`; `deleteTask`, `launch`, `toggleMark` (`act('mark', {cellIndex, marked})`), `end`, `resolveReclaim`, `transferHost` → the matching act; `watchReclaim` → `onReclaim`. The client maps `gameId → code` from `createGame`/`joinGame`/`whoAmI` results (a `Map` plus `sessionStorage` key `play.codeFor.<gameId>` so a reload still resolves).

- [ ] **Step 1: Failing tests** — `roomConnection.test.ts` with a `FakeSocket` class implementing the `WebSocket` surface the manager uses (`send`, `close`, `onopen/onmessage/onclose`, `readyState`) and fake timers:

```ts
it('hello resolves on welcome and emits one snapshot from the full state', ...)
it('act resolves with the ack result and rejects with details.code on a failed ack', ...)
it('a state frame with an older rev is ignored', ...)
it('on close, an in-flight act rejects with offline; a queued act is sent after reconnect', ...)   // Review Focus 1
it('reconnect backs off 500, 1000, 2000 ms and re-sends hello with the gameId', ...)
it('close 4003 calls onFatal with permission-denied and does not reconnect', ...)
it('missing pong for 10 s closes and reconnects', ...)
it('getRoom returns the same connection for the same code', ...)   // the StrictMode double-mount guard
```
`wsGameClient.test.ts`: `it('createGame POSTs with the bearer token and maps a 400 code to details.code', ...)` (mock `fetch`), `it('subscribe emits GameSnapshot with reclaims [] by default', ...)`, `it('toggleMark sends mark with cellIndex and marked', ...)`.
- [ ] **Step 2: Run** — `pnpm --filter web test` → FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; `pnpm --filter web lint` clean (eslint + tsc).
- [ ] **Step 5: Optimistic task rows** — in the lobby, `addTask` shows the new entry immediately with `mine: true` and the typed text (an `optimistic` flag the row renders slightly dimmed via the existing `data-pending` CSS pattern from `BoardGrid`, no new copy) until the next `view` section contains its `taskId`; on error the row is removed and the existing error message shows. `deleteTask` hides the row at once and restores it on error. Implement in the lobby's existing state hook (find it by reading `web/src/pages/lobby/`), not in `RoomConnection`. Add `it('add shows an optimistic row that is replaced by the server view', ...)` beside the hook's existing tests (or in a new `*.test.tsx` using the fake client).
- [ ] **Step 6: Wire** `App.tsx`: `createWsGameClient(import.meta.env.VITE_GAME_SERVER_URL)`; throw at startup with a clear console error if the variable is missing. Add `VITE_GAME_SERVER_URL=ws://127.0.0.1:8787` to `web/.env.local` locally and to `.env.example`.
- [ ] **Step 7: Commit** — `feat(web): WebSocket game client with reconnecting room connection; optimistic task rows`.

---

### Task 8: End-to-end and CI

**Files:**
- Modify: `web/e2e/playwright.config.ts`, `web/package.json` (`e2e` script), `.github/workflows/ci.yml`
- Unchanged: `web/e2e/fullGame.spec.ts`

- [ ] **Step 1: Playwright web servers** — `webServer` becomes an array: (a) `pnpm --filter server exec wrangler dev --port 8787 --ip 127.0.0.1` with `url: 'http://127.0.0.1:8787/health'`, (b) the existing Vite server with `VITE_GAME_SERVER_URL: 'ws://127.0.0.1:8787'` added to its `env` (keep `VITE_USE_EMULATORS: 'true'` for the auth emulator). `web/package.json` `e2e`: `pnpm --filter game-core build && cd .. && firebase emulators:exec --project demo-play-oybc --only auth "pnpm --filter web exec playwright test -c e2e/playwright.config.ts"`.
- [ ] **Step 2: Run** — `pnpm --filter web e2e` → the unchanged `fullGame.spec.ts` passes. If a step fails, the fix belongs in the server or the ws client, never in the spec (it encodes the acceptance behaviour).
- [ ] **Step 3: CI** — `ts` job: remove the Java/firebase-tools/functions-test steps, add `- run: pnpm --filter server test` and `- run: pnpm --filter server typecheck`; `e2e` job unchanged except it no longer needs the functions build (the script handles it). Required checks `ts`, `e2e`, `ios` keep their names.
- [ ] **Step 4: Commit and push** — `test(e2e): run the full game against wrangler dev + auth emulator; CI runs server tests`; `git push origin HEAD:feature/realtime-server`; open a **draft** PR to `dev` titled "Realtime server: Durable Objects + WebSockets (web + iOS)" with the design link; do not merge. Confirm the three checks run (a conflicted PR silently skips CI: check `gh pr view --json mergeStateStatus`).

---

### Task 9: Rehearsal hostname

**Files:** none in the repo (deploy only); `docs/SETUP.md` gets the URL in Task 11.

- [ ] **Step 1: Build** — `VITE_GAME_SERVER_URL=wss://play-oybc-api.oybc.workers.dev pnpm --filter web build`.
- [ ] **Step 2: Preview channel** — `npx firebase hosting:channel:deploy realtime --project play-oybc --expires 14d`; record the channel URL.
- [ ] **Step 3: Smoke from the laptop** — with Playwright (three contexts, phone viewport) against the channel URL: host creates, two guests join by code, host adds 24 tasks + guests add the rest, launch, host marks row 0, guests see the banner, reload a guest, end. This is the e2e flow by hand against production; record outcome and the measured tap round trip from the browser console (the client logs `ack` latency at `debug` level).
- [ ] **Step 4: Report** the channel URL and results in the task report (no commit).

---

### Task 10: iOS client over WebSocket

**Files:**
- Create: `ios/PlayOYBC/Services/RoomConnection.swift`, `ios/PlayOYBC/Services/WebSocketGameService.swift`, `ios/PlayOYBC/Services/FirebaseSession.swift`, `ios/PlayOYBCTests/RoomConnectionTests.swift`, `ios/PlayOYBCTests/WireDecodingTests.swift`
- Modify: `ios/PlayOYBC/Services/FirebaseGameService.swift` (move `configure`/`AuthGate` into `FirebaseSession.swift`; the Firestore implementation stays until the cleanup PR), `ios/PlayOYBC/Services/AppError.swift` (+ `static func fromClose(code: Int) -> AppError`: 4003 → `permission-denied`, 4004 → `game-not-found`, 4001 → `unauthenticated`), `ios/PlayOYBC/PlayOYBCApp.swift` (construct `WebSocketGameService`; forward `scenePhase` changes), `ios/PlayOYBC/Models/Schema.swift` (+ `resolvedAt: Double?` on `ReclaimDoc`), `ios/project.yml` (Info `GameServerURL: wss://play-oybc-api.oybc.workers.dev`, `MARKETING_VERSION "1.0.2"`), then `xcodegen generate` and commit the regenerated project.

**Interfaces:**
- Consumes `GameService` (`ios/PlayOYBC/Services/GameService.swift`, unchanged) and `GameSnapshot`.
- Produces `RoomConnection` (`actor`): `init(url: URL, code: String, tokenProvider: @escaping () async throws -> String, session: URLSession = .shared)`; `func hello(gameId: String?) async throws -> Welcome`; `func act<T: Decodable>(_ op: String, _ args: [String: Any]) async throws -> T` (same queue/offline/ack semantics as web); `func snapshots() -> AsyncStream<GameSnapshot>`; `func reclaimStatus(id: String) -> AsyncStream<ReclaimStatus>`; `func fatal() -> AsyncStream<AppError>`; `func suspend()` (cancel socket, stop timers; called on background) and `func resume()` (reconnect; called on foreground); same backoff, ping/pong, rev guard, section merge.
- Produces `WebSocketGameService: GameService` with `init(baseURL: URL, session: FirebaseSession)`; `createGame` POSTs like web; the rest map one-to-one to acts; `subscribe` yields from `snapshots()` and finishes with `fatal()`'s error; `watchReclaim` from `reclaimStatus`. Base URL: `UserDefaults.standard.string(forKey: "gameServer")` (launch arg `-gameServer`) else Info.plist `GameServerURL`.
- Produces `FirebaseSession`: `static func configure()` (FirebaseApp.configure, idempotent) and `func idToken() async throws -> String` (ensures anonymous sign-in, returns `getIDToken()`).

- [ ] **Step 1: Failing tests** — `WireDecodingTests`: decode a `state` frame with a `board: null`, a partial `state` (only `view`), an `ack` failure with `details.token`, a `welcome` with `seatId: null`; `RoomConnectionTests` with an injected `URLProtocol`-free fake transport (`RoomConnection` takes a `Transport` protocol with `send`/`receive`/`cancel`; `URLSessionTransport` is the real one): `hello → welcome → one snapshot`, `in-flight act rejects offline on close`, `older rev ignored`, `suspend then resume reconnects and re-hellos with gameId`.
- [ ] **Step 2: Run** — `xcodebuild test -scheme PlayOYBC -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.3.1'` (external paths per Global Constraints) → FAIL on the new tests. **Step 3: Implement.** **Step 4: Run** → PASS; also run the `PlayOYBCSnapshotTests` scheme and confirm the count of passed/failed is unchanged from `dev` (no UI change).
- [ ] **Step 5: Archive 1.0.2** — `xcodebuild archive` to `/Volumes/Stephen/play-oybc-archives/PlayOYBC-1.0.2.xcarchive` and `-exportArchive` with the existing `ExportOptions` **without uploading** (export method `app-store-connect`, `upload: false`, or skip export and leave the archive). Report the archive path; the owner uploads or asks for it.
- [ ] **Step 6: Commit** — `feat(ios): WebSocket game service with background teardown and reconnect; 1.0.2`.

---

### Task 11: Docs and runbook

**Files:**
- Modify: `docs/SETUP.md` (env keys: `VITE_GAME_SERVER_URL`, `PLAY_ADMIN_TOKEN`; emulator section → "Local server": `pnpm --filter server dev` + `firebase emulators:start --only auth`; Deploy: `wrangler deploy`, `wrangler secret put ADMIN_TOKEN`; Load check: unchanged command; Party-day runbook: step 1 removed (no warm instances), step 2 `forceHost` usage unchanged, add "rehearsal URL" line; iOS manual test: `-gameServer ws://127.0.0.1:8787` replaces `-useEmulators YES`), `docs/DESIGN.md` (one line under §5: superseded by `docs/REALTIME_SERVER.md`), `CLAUDE.md` in the Play repo (Architecture → point at the new doc; commands for `server/`), `docs/REALTIME_SERVER.md` (mark status "built; rehearsal pending", add the Worker and channel URLs).
- [ ] **Step 1: Edit** the files above. No new user-facing copy anywhere.
- [ ] **Step 2: Commit and push** — `docs: realtime server setup, runbook and architecture pointers`; push; mark the draft PR ready for the owner's review (still not merged).

---

## Self-review notes

- Spec coverage: §4 topology (T1, T5), §5.1 state (T2), §5.2 ops + idempotency + eviction (T3, T4, T5), §5.3 protocol (T1, T5, T7, T10), §5.4 connections (T5, T7, T10), §6 clients incl. C.3 rows and config (T7, T10), §7 safety incl. admin and rate limits (T5, T6), §8 lifecycle (T5), §9 observability (T5: structured log line per act is part of `GameRoom`; `/health` T1), §10 testing (T1–T5, T7, T8, T10), §11 rollout (T6, T8, T9, T10 archive, T11).
- Type consistency: `Push`, `OpOut`, `Section`, `StateMsg`, `CLOSE` are defined once (T1/T3) and used by name in T4–T10; `RoomConnection` on both platforms exposes the same five operations.
- Known deliberate gaps: Firestore/functions cleanup and the `staging` environment are post-party (spec §11.5); the rate-limit binding availability is settled by the Task 5 implementer with the specified fallback.
