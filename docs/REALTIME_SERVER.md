# Play OYBC — Realtime Server Design

Status: **built on `feature/realtime-server`; rehearsal pending (PR #8)** (approved 2026-10-26; owner: "go ahead", "progress on full
server implementation"). Supersedes `docs/DESIGN.md` §5.1–§5.4 (Cloud Functions + Firestore). §4 of
that document (requirements) and §7 (decisions) still hold. Rulings made overnight without the
owner are marked *(ruling)* in §13 and are open to reversal.

## 1. Intent

Every player action today is an HTTPS call to a Cloud Function that may be asleep, followed by a
Firestore transaction, followed by a listener push. Measured on the live project 2026-10-26: a cold
function answers in 2.4–4.9 s, a warm one in 180–350 ms, and the screen waits for the whole round
trip on everything except marks. The owner's verdict: "the latency is unacceptable in its current
state."

The replacement holds each game in one always-ready process that phones stay connected to. Measured
with the throwaway spike on real Cloudflare (`spike/realtime-server`, 2026-10-27): connect and
authenticate in 54–63 ms, tap round trip p50 41 ms / p95 57 ms from a laptop, server work per tap
≈ 0 ms, and an idle game costs nothing while sleeping yet wakes without any connected phone
noticing.

Beyond the party, Play is meant to grow past the owner's own use: many games at once, hosts the
owner has never met, pools built together over the days before an event, and reusable themed packs.
The server must therefore be cheap when idle, boring when busy, and durable across days.

## 2. Goals, non-goals, anti-goals

**Goals**
- Perceived latency ≈ 0 on every action: the UI never waits for the server; the server confirms or
  corrects within ~50–100 ms inside a room.
- One game = one process = one source of truth. No transactions, no retries, no contention.
- A game survives days between setup and play, server restarts, and phones coming and going.
- Feature parity with today: every rule in `functions/src/api/*` and both clients' behaviour
  (resume, reclaim, host transfer, hiding, bingo order, late join) is preserved exactly. The
  acceptance test is the existing 14-step smoke test and 22-step iOS list in `docs/SETUP.md`.
- Both clients keep their current interface (`GameClient` / `GameService`); only the implementation
  behind it changes. No UI changes.
- Safe for strangers: per-game caps, rate limits, self-cleaning storage.
- Safe to rehearse: deploys to its own hostname beside the current app, which stays live untouched.

**Non-goals (this train)**
- Themed packs, saved games, accounts beyond anonymous sign-in, the host review gate, game history.
- Diff/patch wire format (section-level replacement is enough; see §5.3).
- Moving the web app's hosting or the iOS build pipeline.

**Anti-goals**
- Any game logic on a phone. Phones render views; the server decides.
- Any path where a phone receives task text it may not see.
- A second source of truth (no Firestore mirror of live game state).

## 3. Platform

| Piece | Choice | Why |
| --- | --- | --- |
| Compute | Cloudflare Workers + **Durable Objects** (SQLite-backed) | one object per game, single-threaded, built-in storage, hibernating WebSockets, ~ms wake |
| Transport | WebSocket (Hibernation API), JSON text frames | persistent, server push, sleeps free between messages |
| Identity | **Firebase Auth** (unchanged) — ID tokens verified on the Worker via Google's JWKS (`jose`) | both clients already have it; anonymous → linked account later without re-keying |
| Game logic | `packages/game-core` unchanged | pure TS, no Node deps (verified), already unit-tested |
| Web hosting | Firebase Hosting (unchanged) | preview channels give the rehearsal hostname for free |
| Retired after cutover | Cloud Functions, Firestore (game data), `firestore.rules`, the functions emulator | replaced wholesale |

Cost at the party: Workers Paid plan $5/month; DO usage for one 3-hour game is cents. Idle games
cost storage only (≈ $0.20/GB-month; a game is tens of KB).

## 4. Topology

```
 phone ──wss──┐                                      ┌─ GameRoom("H7K2Q")  (SQLite + memory)
 phone ──wss──┼──▶ Worker (router)  ──idFromName(code)─┼─ GameRoom("M3PX8")
 phone ──wss──┘    POST /api/createGame                └─ GameRoom(…)        one object per join code
                   GET  /health
                   verifies Firebase ID tokens (JWKS cached per isolate)
```

- **`GameRoom` Durable Object, keyed by join code.** The code is the routing key; no directory
  object, no global hotspot. The object is placed near the first request (the host), which is
  where the room is.
- **Game epoch.** Inside the object every game has a random `gameId`. Codes may be reused after a
  game is purged (§8); a phone carrying a stale `gameId` for that code is told `game-not-found`.
- **`createGame` is HTTP** (no socket exists before a code is known): the Worker generates a code
  with `generateGameCode`, asks that `GameRoom` to `claim(gameId, host)`, retries up to 5 times on a
  taken code (same policy as today), returns `{gameId, code, seatId}`.
- **Everything else is one WebSocket per device per game**, upgraded at `GET /ws/:code` and handed
  to the object. The Worker never touches game state.
- **No per-user object yet.** Packs and profiles later get a `UserProfile` object keyed by uid (or
  Firestore). The only seam reserved now: every seat records the uid that holds it.

## 5. The object

### 5.1 State

Canonical state is the current Firestore model, moved into the object's SQLite tables with the
same field names and types (`packages/game-core/src/schema.ts` stays the schema):

| Table | Row | Notes |
| --- | --- | --- |
| `game` | one row: `gameId, code, stage, hostSeatId, createdAt, launchedAt, endedAt, bingoCount, reviewGate, rev` | `rev` = monotonically increasing change counter |
| `seats` | `seatId, name, nameKey, joinedAt` | |
| `members` | `uid, seatId` | which sign-in holds which seat; replaced on an approved reclaim |
| `tasks` | `taskId, text, authorSeatId, mentions(JSON), createdAt` | canonical text; never sent raw |
| `boards` | `seatId, cells(JSON), marks(JSON), completedLines(JSON), announcedLines(JSON)` | |
| `bingos` | `seq, seatId, name, line, playerBingoNumber, at, status` | |
| `reclaims` | `id, requesterUid, name, seatId, status, createdAt, resolvedAt` | |

On wake the object loads all tables into memory (`blockConcurrencyWhile`; ~100 rows, milliseconds).
Every mutation updates memory and writes through to SQLite synchronously in the same event. The
runtime's output gate guarantees no reply or push leaves before those writes are durable, so there
is no "acked but lost" window and no transaction code.

`shortfalls` and every per-seat view are **derived on demand** from tasks + seats (`shortfalls`,
`buildPoolView`), never stored.

### 5.2 Operations

The rules of every handler in `functions/src/api/*.ts` are ported one-to-one, including app error
codes (`invalid-name`, `invalid-text`, `game-not-found`, `game-ended`, `unknown-mention`,
`self-mention`, `not-host`, `wrong-stage`, `not-ready`, `invalid-cell`, `unknown-seat`,
`reclaim-not-found`, `reclaim-cooldown`), so both clients' error mapping is untouched. In
particular: name normalisation and uniqueness, resume for an existing member in any stage, reclaim
with the 60 s cooldown and the "approve evicts the old device" semantics, mid-game join deals a
board, launch requires 24 dealable tasks per seat, bingos announced once per line per board with a
global `seq`, unmark never retracts a bingo, end only from `playing`, delete by author or host,
host transfer in any stage.

Two additions:
- **Idempotent actions.** Every action carries a client-generated `id`; `addTask` also carries a
  client-generated `taskId`; `mark` carries the desired value (already true). A retried action after
  a reconnect therefore cannot double-apply.
- **Eviction is explicit.** When a seat's holder changes (approved reclaim), the old device's sockets
  receive `evicted{reason:'replaced'}` and close with code 4003. Today this surfaces as a listener
  `permission-denied`; both clients map it to "You've been replaced".

### 5.3 Wire protocol

Text frames, JSON. `t` is the message type.

Client → server
- `hello {token, gameId?}` — first frame. Verifies the Firebase ID token. Answers `welcome` (and, if
  the uid holds a seat, a full `state`). Replaces today's `whoAmI`.
- `act {id, op, args}` — `op` ∈ `join, addTask, deleteTask, launch, mark, end, resolveReclaim,
  transferHost`. Answered by exactly one `ack {id, ok:true, result}` or `ack {id, ok:false, code,
  details}`.
- `ping` — answered `pong` by the runtime without waking the object (auto-response).

Server → client
- `welcome {uid, gameId, seatId|null, stage, rev}`.
- `state {rev, game?, seats?, view?, board?, bingos?, reclaims?}` — **section-level replacement**:
  only the sections that changed are present, each complete. The client replaces those sections of
  its last snapshot and re-emits the same `GameSnapshot` shape the UI already consumes. A tap sends
  `board` to the tapper only (~2 KB); a bingo adds `bingos` + `game` to everyone; a task add sends
  `view` + `game` to everyone. `reclaims` goes only to the host's sockets. A `state` with `rev` ≤
  the last applied is ignored.
- `reclaim {id, status}` — to a pending requester's sockets (replaces `watchReclaim`).
- `evicted {reason}` then close 4003; `error {code}` then close 4004 for `game-not-found`.

Per-seat views are computed at push time from canonical state with the existing `buildPoolView`
and `canSeeText`; board cell text is resolved at deal with the existing `dealBoard`. A socket is
associated with a uid (and so a seat) only after `hello` succeeds; the association is stored with
the socket (`serializeAttachment`) so it survives hibernation.

### 5.4 Connections

- The runtime keeps sockets open while the object sleeps; `ping/pong` costs nothing. The object
  wakes on the next real frame, reloads state from SQLite, and continues. Confirmed in the spike:
  the object was evicted and recreated under a browser that never reconnected.
- Token lifetime: verified at `hello`; the socket is trusted for its lifetime. Every reconnect
  presents a fresh token. (Later: the server may request `reauth` on sockets older than 24 h.)
- Close codes: 4001 bad token · 4003 evicted · 4004 game not found · 4008 rate limited · 4013
  payload too large.

## 6. Clients

Both clients keep their public seam unchanged — web `GameClient` (`web/src/game/GameClient.ts`),
iOS `GameService` (`ios/PlayOYBC/Services/GameService.swift`) — and gain a second implementation
beside the Firebase one: `web/src/game/wsGameClient.ts` and
`ios/PlayOYBC/Services/WebSocketGameService.swift`. The UI, view models, fake clients and tests
that consume the seam do not change.

**Connection manager (one per client, same design on both):**
- One socket per game. States: `idle → connecting → authenticating → ready`, and `ready → closed →
  backoff → connecting`. Backoff 0.5 s doubling to 8 s with jitter; immediate retry on
  `visibilitychange`/`online` (web) and `scenePhase == .active` + path becomes satisfied (iOS).
- `whoAmI(code)` opens the socket and resolves from `welcome`. `subscribe(gameId, seatId)` attaches
  to the socket's snapshot stream; every reconnect yields a fresh full `state`, re-emitted to the
  UI (a resume, in effect, with no UI involvement).
- Actions while not `ready` queue for up to 10 s, then fail with code `offline`. Because actions are
  idempotent (§5.2), an action sent just before a drop is simply re-sent after reconnect.
- Liveness: a `ping` every 25 s; no `pong` within 10 s ⇒ treat the socket as dead and reconnect.
- The spike's double-socket in React dev mode (StrictMode double-mount) is prevented by making the
  manager a module singleton keyed by code, not an effect-owned object.
- Optimistic marks stay exactly as implemented today (`BoardGrid` overrides, `GameViewModel`
  overlay); `addTask`/`deleteTask` additionally get an optimistic pending row (C.3 from the
  latency plan) — the one UI-adjacent change, and a client-only one.

**Configuration:** web `VITE_GAME_SERVER_URL` (e.g. `wss://play-oybc-api.oybc.workers.dev`,
`ws://127.0.0.1:8787` for `wrangler dev`); iOS `GameServerURL` in Info.plist via `project.yml`, with
a `-gameServer <url>` launch argument override replacing `-useEmulators`.

**iOS background behaviour:** the manager does not depend on what iOS does to a backgrounded
socket. On `scenePhase != .active` it cancels the socket itself; on `.active` it reconnects and
receives a full `state`. The owner's phone test on the spike build confirms the reconnect path; it
is not a precondition.

## 7. Safety for strangers

- Caps enforced in the object: 50 seats per game, 500 live tasks, 120-char text (existing), 64 KB
  max frame, 100 sockets per game.
- Rate limits: 20 actions/s per socket (then 4008), `createGame` 10/min and socket upgrades 60/min
  per IP via the Worker (Cloudflare rate-limiting binding).
- A frame before `hello`, or after a failed `hello`, closes the socket.
- The Worker only verifies tokens and routes; it never reads or writes game state itself, so a
  compromised client can at most act as its own uid inside games it was admitted to.
- **Admin path (replaces `scripts/forceHost.ts`):** `GET /admin/:code/seats` and
  `POST /admin/:code/transferHost {seatId}`, accepted only with `Authorization: Bearer
  <ADMIN_TOKEN>` where `ADMIN_TOKEN` is a Worker secret (`wrangler secret put`). The Worker forwards
  to the object's admin handler, which performs the same host transfer as the host op but without
  the host check. `scripts/forceHost.ts` is rewritten to call these; the party runbook step 2 keeps
  working with a lost host phone.
- If the Cloudflare rate-limiting binding is unavailable on the account's plan, the Worker falls
  back to a per-IP counter in a small `RateLimiter` object; the limits in this section are the same
  either way.

## 8. Lifecycle and cleanup

An alarm (Durable Object Alarms API) is re-armed on every mutation:
- `ended` + 7 days → purge all tables, freeing the code.
- Any stage with no mutation for 30 days → purge.
Purging a game is what makes its code reusable; the `gameId` epoch (§4) protects stale phones.

## 9. Observability

- Workers observability logs enabled; one structured line per action: `op, code, gameCode, ms,
  seats`. `wrangler tail` for live viewing during the party.
- `GET /health` for uptime checks.
- No PII in logs: names and task text are never logged.

## 10. Testing

| Layer | Tool | What |
| --- | --- | --- |
| Game logic | Jest (unchanged) | `packages/game-core` |
| Object rules | Vitest + `@cloudflare/vitest-pool-workers` (runs the real object with real SQLite in miniflare) | port of `functions/test/{createJoin,host,play,tasks}` — every rule and error code in §5.2 |
| Protocol | same harness, WebSocket clients | hello/ack/state sequencing, section pushes, eviction, idempotent retry, caps |
| Full game | Playwright (`web/e2e/fullGame.spec.ts`, **unchanged**) against `wrangler dev` + the Firebase Auth emulator | the server accepts the emulator's unsigned tokens only when `AUTH_MODE=emulator`, a dev-only config |
| Load | `scripts/loadTest.ts` rewritten for the socket protocol, same assertions (20 seats, 60 tasks, 200 marks, contiguous `seq`), p50 target < 150 ms | against staging |
| iOS | `PlayOYBCTests` with `FakeGameService` (unchanged) + the 22-step manual list | |

CI: the `ts` job gains the object tests and drops the functions emulator; `e2e` swaps the emulators
for `wrangler dev` + auth emulator; `ios` unchanged.

## 11. Rollout (party week)

Calendar: today Tue 10-27; party Sat 10-31.

1. **Tue–Thu:** build on `feature/realtime-server` in the order **server → web → iOS**, so a
   half-built Thursday still yields a usable web game (guests are on web; the owner can host from
   the web link if iOS is not ready). Deploys are by hand from the laptop (`wrangler deploy`,
   `firebase hosting:channel:deploy`); CI deploy jobs come later.
2. **One Worker this week:** `play-oybc-api` is both the rehearsal and the party backend; there
   are no live games to protect yet, so a staging environment buys nothing until there are real
   users. Web: a Firebase Hosting preview channel (`realtime`) built with `VITE_GAME_SERVER_URL`
   pointing at it. iOS: a local TestFlight upload as **1.0.2** pointing at it; 1.0.1 (8) stays
   installable from TestFlight as the fallback. Every phone on the new build or the preview URL is
   on the same backend.
3. **Friday rehearsal:** the 14-step smoke test with the owner + 2–3 real phones on the preview
   hostname, plus the load test. Go/no-go is the owner's call.
4. **Party:** go ⇒ deploy hosting to the live site and merge to `dev` (the Xcode Cloud build it
   triggers is identical to 1.0.2 in behaviour). No-go ⇒ the current app, untouched, runs the
   party. No game is migrated between backends; the party game is created on Saturday on whichever
   backend is live.
5. **After:** delete the game callables, Firestore rules/indexes and emulator config; update
   `docs/DESIGN.md`, `docs/SETUP.md`, `CLAUDE.md`; set `MIN_INSTANCES` back to 0 or remove the
   functions project entirely; add a `staging` Wrangler environment before the first non-owner
   hosts.

URLs: Worker `https://play-oybc-api.oybc.workers.dev`; rehearsal channel `https://play-oybc--realtime-kd3r1anx.web.app` (expires 2026-11-10).

## 12. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| iOS sockets and backgrounding behave unexpectedly | the manager tears down on background and reconnects on foreground regardless; the owner's spike test confirms the path |
| Only the owner uses iOS at the party; a late iOS build is the critical path | server → web → iOS build order; the owner can host from web; 1.0.2 points at the same single Worker as web |
| Google's JWKS endpoint unavailable | `jose` caches keys per isolate; allow a cached set up to 24 h |
| A remote player far from the room | the object lives near the host; cross-continent RTT 150–300 ms is still under today's warm path |
| Clock: Thursday go/no-go with 5 days total | the fallback is the working app; nothing in B touches it until cutover |
| Code reuse confuses a stale phone | `gameId` epoch ⇒ `game-not-found` ⇒ existing "forget and go home" path |
| Section replacement sends more bytes than a diff | measured per-phone traffic for a 20-player, 60-task, 200-mark game ≈ 1–2 MB; revisit only if a real game shows otherwise |

## 13. Decisions

| Decision | By |
| --- | --- |
| Always-on server; Cloudflare added as a second vendor | Owner |
| Optional sign-in for hosts and guests long-term; Firebase Auth kept for it | Owner |
| Games persist across days; packs are a later, separate object | Owner (product), Claude (seam) |
| Rehearse on a separate hostname; current app is the party-day fallback | Owner |
| Object keyed by join code with a `gameId` epoch; no directory object | Claude |
| Same schema and rules moved into SQLite; views derived on demand | Claude |
| Section-level state replacement, not diffs | Claude |
| Idempotent actions with client ids; 10 s offline queue | Claude |
| Caps, rate limits and purge timings in §7–§8 | Claude (owner may tune) |
| Build order server → web → iOS; web-only is an acceptable party fallback | Claude *(ruling, 2026-10-27)* |
| One Worker environment this week; staging deferred until real users | Claude *(ruling)* |
| iOS manager tears down on background regardless of OS behaviour | Claude *(ruling)* |
| Admin route + secret replaces `forceHost` | Claude *(ruling)* |
| Manual deploys from the laptop this week | Claude *(ruling)* |
| No game migration at cutover | Claude *(ruling)* |

## 14. Left to the builder

File layout inside `server/`, exact SQL DDL, message field names beyond those above, how the
connection manager is unit-tested on each platform, wrangler environment naming, the preview
channel name, and the structured-log field set.
