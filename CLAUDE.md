# Play OYBC

Play OYBC is a real-time party-bingo game: a group in one room builds a shared pool of "things that might happen tonight," each player is dealt a random 5x5 board from that pool, and people race to get bingos. Server-authoritative backend: a Cloudflare Worker + Durable Object per game in `server/` (design: `docs/REALTIME_SERVER.md`), Firebase Anonymous Auth for identity (Firestore/Functions game code is legacy until cutover, then removed), React web client first, native SwiftUI iOS client after. Spec: `docs/DESIGN.md`; plan: `docs/PLAN_MVP.md`; product background: `docs/PLAY_OYBC.md`; setup values: `docs/SETUP.md`.

## Architecture invariants (inverted from the solo OYBC app)

| Solo-app assumption | Play's rule |
| --- | --- |
| Local DB is the source of truth | **Session state is server-authoritative.** Clients render server state; they do not own it. |
| Offline-first; sync is background-only | **Online-required.** Offline play is an explicit non-goal. |
| LWW conflict resolution | Real-time competitive state; authority + ordering come from the backend. |
| No server push / lazy detection only | Live push (lobby presence, pool updates, launch fan-out, race state) is the whole point. |
| Global-per-Task completion | **Per-player, per-session completion.** Nothing completes globally. |
| Web/iOS parity rule with the solo app | Play is a separate product; never mirror a solo-app surface here. |

Every write goes through the server (`GameRoom` over WebSocket; legacy: callable Cloud Functions); never add a client write rule.

## Global Constraints

- New repo lives at `/Volumes/Stephen/play-oybc`; GitHub `2014sheas/play-oybc`. No runtime or build dependency on the oybc repo or `oybc-dev-e2668`; reused code is **copied**.
- All Xcode builds use `-derivedDataPath /Volumes/Stephen/play-oybc-derived` (never an internal derived-data dir).
- Board: **5×5, FREE center at index 12**, 24 tasks per board. `GRID_SIZE = 5`, `TASKS_PER_BOARD = 24`.
- Clients never write Firestore (legacy, until cutover). `firestore.rules`: every `write` is `false`.
- A blurred pool entry carries **no task text** in any document the viewer can read.
- Game stages: `'lobby' | 'playing' | 'ended'`.
- Display names: trimmed, inner whitespace collapsed to one space, 1–20 chars, letters/digits/space/`'`/`’`/`-` only; uniqueness is case-insensitive.
- Game code: 5 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`; join link path `/g/<CODE>`.
- Banner copy exactly: `"<Name> got a bingo!"`. Lobby shortfall copy exactly: `"<Name> needs <n> more task"` / `"... more tasks"` (n = 1 singular). Reclaim prompt: `"<Name> wants back in"`.
- Owner UI rule (carried from oybc): screens carry labels, values and controls — no explanatory sentences (no "Tip:", helper lines, captions). Allowed: validation errors, loading/error states, confirm-dialog bodies, one-line empty states.
- Write "Bingo" in normal case (never "BINGO") in UI copy.
- Web is built first for every feature; iOS (Tasks 15–17) follows. If the date gets tight, iOS slips, web does not.
- (Legacy, until cutover) Functions region `us-central1`; every callable gets `minInstances` from a param `MIN_INSTANCES` (default `0`, set to `1` for the party).

## Firestore layout (legacy, until cutover)

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

## Commands

```bash
pnpm install
pnpm test                          # pnpm -r test
pnpm --filter game-core test       # pure game logic (Jest)
pnpm --filter server dev            # local Worker on ws://127.0.0.1:8787 (server/.dev.vars; pair with firebase emulators:start --only auth)
pnpm --filter server test
pnpm --filter server typecheck
(cd server && npx wrangler deploy)  # deploy the Worker; npx wrangler tail for logs
pnpm --filter scripts load         # 20-seat load test against the Worker
pnpm --filter scripts forceHost <CODE> [<seatId>]   # needs PLAY_ADMIN_TOKEN or .setup-secrets/ADMIN_TOKEN
pnpm --filter functions test        # legacy; needs emulators: firebase emulators:exec --only firestore,auth,functions "pnpm --filter functions test"
pnpm --filter web dev              # web dev server
pnpm --filter web e2e              # full-game Playwright test (Auth emulator + wrangler dev; needs Java; locally also export PLAYWRIGHT_BROWSERS_PATH=/Volumes/Stephen/ms-playwright, never the internal disk)
# iOS (from ios/, after xcodegen generate):
xcodebuild test -project PlayOYBC.xcodeproj -scheme PlayOYBC -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.3.1' -derivedDataPath /Volumes/Stephen/play-oybc-derived
# snapshot tests (PNG baselines in ios/PlayOYBCSnapshotTests/__Snapshots__; record on iPhone 17 / OS=26.3.1 only):
xcodebuild test -project PlayOYBC.xcodeproj -scheme PlayOYBCSnapshotTests -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.3.1' -derivedDataPath /Volumes/Stephen/play-oybc-derived
```

## iOS notes

Swift `Task` is not shadowed here (there is no Do model), but name any game-task model `GameTask`, never `Task`; the iOS code still writes `_Concurrency.Task` defensively. `ios/PlayOYBC/Riso/` files are copies from the oybc repo (the Do-only `RisoTaskKind` / `RisoTypeBadge` block was removed); never reference the oybc repo at build time. `ios/PlayOYBC/GoogleService-Info.plist` is gitignored; CI copies `GoogleService-Info.template.plist` (fake values) over it.
