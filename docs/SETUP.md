# Setup

## Task 0 (owner setup): DONE

## Firebase project id

`play-oybc`

## iOS bundle id

`com.oybc.PlayOYBC`

- iOS app id: `1:793152912249:ios:9149dcf1ae797da5cdcda8`
- `GoogleService-Info.plist` goes to `ios/PlayOYBC/GoogleService-Info.plist` (gitignored).

## Web env keys

Web app id: `1:793152912249:web:f3a365d6f7e07238cdcda8`

Set in `web/.env.local` (gitignored); template in `web/.env.example`:

- `VITE_FIREBASE_API_KEY=`
- `VITE_FIREBASE_AUTH_DOMAIN=`
- `VITE_FIREBASE_PROJECT_ID=play-oybc`
- `VITE_FIREBASE_APP_ID=1:793152912249:web:f3a365d6f7e07238cdcda8`
- `VITE_USE_EMULATORS=` (`true` connects the Auth emulator; the legacy Firebase game backend also uses the Firestore/Functions emulators)
- `VITE_GAME_SERVER_URL=` (`ws://127.0.0.1:8787` locally; `wss://play-oybc-api.oybc.workers.dev` for a production build)

Scripts read `PLAY_ADMIN_TOKEN` (or `.setup-secrets/ADMIN_TOKEN`) for the admin routes; `PLAY_API_URL` optionally overrides the Worker URL.

## Local server

Design: `docs/REALTIME_SERVER.md`. The game runs on the Cloudflare Worker `play-oybc-api` in `server/` (one `GameRoom` Durable Object per join code).

```bash
pnpm --filter server dev                                      # wrangler dev on ws://127.0.0.1:8787; reads server/.dev.vars (AUTH_MODE=emulator, FIREBASE_PROJECT_ID=demo-play-oybc)
firebase emulators:start --only auth --project demo-play-oybc  # anonymous Auth emulator; --project is required (see below)
pnpm --filter server test
pnpm --filter server typecheck
```

Local auth: the local server accepts only unsigned emulator tokens whose audience is `demo-play-oybc` (emulator mode refuses any project id that does not start with `demo-`). The Auth emulator stamps tokens with the project it was started for, not the client's configured project, so start it with `--project demo-play-oybc`; without the flag it uses `.firebaserc`'s `play-oybc` and every `hello` closes 4001.

- Web against the local server: in `web/.env.local` set `VITE_USE_EMULATORS=true`, `VITE_FIREBASE_PROJECT_ID=demo-play-oybc` and `VITE_GAME_SERVER_URL=ws://127.0.0.1:8787` (the e2e config, `web/e2e/playwright.config.ts`, uses exactly these).
- iOS simulator against the local server: launch arguments `-useEmulators YES -gameServer ws://127.0.0.1:8787`. `-useEmulators YES` is still needed: it points Auth at the emulator on 127.0.0.1:9099 (without it the app signs in to the real `play-oybc` Auth and the local server rejects the token). The bundled `GoogleService-Info.plist` (project `play-oybc`) is fine: the emulator resolves the project from the API key to its own `--project` (firebase-tools 15.13 `getProjectIdByApiKey`), so tokens carry `aud: demo-play-oybc`. A physical device cannot reach 127.0.0.1; test devices against the deployed Worker.

`pnpm --filter web e2e` wraps Playwright in `firebase emulators:exec --only auth`; Playwright starts `wrangler dev` and Vite itself. Locally Java must be on PATH (`export PATH=/opt/homebrew/opt/openjdk/bin:$PATH`).

### Legacy emulators (until cutover)

`firebase emulators:start` starts all emulators for the Firebase game backend, retired after the party.

## Deploy

Server (Worker):

```bash
cd server && npx wrangler deploy
npx wrangler secret put ADMIN_TOKEN   # once; guards the admin routes
npx wrangler tail                     # live logs
```

Worker URL: `https://play-oybc-api.oybc.workers.dev` (`GET /health`; WebSocket `wss://play-oybc-api.oybc.workers.dev/ws/<CODE>`). Rate limits: `createGame` 10/min and `/ws` upgrades 600/min per IP; per-socket 20 acts/s with burst 40. Rooms are purged 7 days after ending or after 30 days idle.

Rehearsal web build on the Hosting preview channel `realtime` (expires 2026-11-10): `https://play-oybc--realtime-kd3r1anx.web.app`. Prerequisite: `web/.env.local` holds the real Firebase web keys.

```bash
cp .setup-secrets/web.env.local web/.env.local   # gitignored
VITE_GAME_SERVER_URL=wss://play-oybc-api.oybc.workers.dev VITE_USE_EMULATORS=false pnpm --filter web build
npx firebase hosting:channel:deploy realtime --project play-oybc --expires 14d
```

Live site `https://play-oybc.web.app` runs the Firebase backend until cutover.

### Go: cut over the live site to the realtime server

Only after the owner's go. Prerequisite: `cp .setup-secrets/web.env.local web/.env.local` (gitignored; real Firebase web keys), and the Worker deployed and healthy (`https://play-oybc-api.oybc.workers.dev/health`).

```bash
cp .setup-secrets/web.env.local web/.env.local   # gitignored
npx firebase hosting:clone play-oybc:live play-oybc:legacy --project play-oybc   # snapshot the current live release first
VITE_GAME_SERVER_URL=wss://play-oybc-api.oybc.workers.dev VITE_USE_EMULATORS=false pnpm --filter web build
npx firebase deploy --only hosting --project play-oybc
```

Rollback (restores the snapshot taken above, the Firebase-backend web app): `npx firebase hosting:clone play-oybc:legacy play-oybc:live --project play-oybc`, or Firebase Console → Hosting → release history → Roll back. (There is no `hosting:rollback` command.)

### Legacy Firebase deploy (only from a pre-merge `dev` checkout)

Run this only from a checkout of `dev` before this branch merged. From this branch it would build a web app with no `VITE_GAME_SERVER_URL` and ship a blank live site.

```bash
cp .setup-secrets/web.env.local web/.env.local   # gitignored
pnpm --filter web build
firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
```

Legacy: functions read `MIN_INSTANCES` from `functions/.env.play-oybc` (emulators use `functions/.env.demo-play-oybc`).

## Load check

`scripts/loadTest.ts` runs 20 seats against the Worker (`PLAY_API_URL` overrides the target): adds tasks concurrently, launches, fires random marks, and asserts no failed calls, consistent bingo counts and sequence numbers, and a latency bound. Failures are counted, never retried. Last result: `mark p50=53ms p95=245ms, 0 failures`.

```bash
pnpm --filter scripts load
```

## Party-day runbook

Two paths stay open until the owner's go/no-go after the Friday rehearsal.

### Realtime (PR #8)

1. Nothing to warm. Check `https://play-oybc-api.oybc.workers.dev/health`.
2. Host recovery: create the party game on the host phone and keep the host seat there. If that phone is lost, run `pnpm --filter scripts forceHost <CODE>` to list the seats (seatId, name, occupied), then `pnpm --filter scripts forceHost <CODE> <seatId>` to make an occupied seat the host (needs `PLAY_ADMIN_TOKEN` or `.setup-secrets/ADMIN_TOKEN`, and the `ADMIN_TOKEN` Worker secret must already be set; see Deploy).
3. If a guest says they asked to get back in and the host phone shows no prompt, reload the host's game screen; the prompt list re-attaches.
4. Rehearsal URL: `https://play-oybc--realtime-kd3r1anx.web.app`. Watch live with `cd server && npx wrangler tail`.

### Fallback (current app on play-oybc.web.app)

1. `MIN_INSTANCES=1` has been deployed since 2026-10-26 (`functions/.env.play-oybc`, then `firebase deploy --only functions`).
2. Host recovery: keep the host seat on the host phone. If that phone is lost, run `pnpm --filter scripts forceHostLegacy <CODE>` to list the seats, then `pnpm --filter scripts forceHostLegacy <CODE> <seatId>` to make an occupied seat the host (writes the Firestore game directly; needs `gcloud auth application-default login` as before).
3. Same reload advice as above.

Next day, either path: set `MIN_INSTANCES=0` and run `firebase deploy --only functions`.

## Smoke test

Run on the hosted URL with the host plus at least 2 other phones.

| # | Step | Pass/Fail |
| --- | --- | --- |
| 1 | Host opens the site, enters a name, creates a game; the lobby shows a code and QR | |
| 2 | Two or more phones scan the QR, enter names, and join; all appear in the player list on every phone | |
| 3 | Joining with a duplicate name (different case) is rejected | |
| 4 | Each player adds tasks; the pool updates live on every phone | |
| 5 | Add a task with `@name` of another player; it is blurred for that player and visible to others | |
| 6 | Add a task with `@someone` and one with `@anyone`; check blurring on each phone | |
| 7 | Shortfall copy ("<Name> needs <n> more tasks") shows until everyone has 24 dealable tasks | |
| 8 | Host launches once everyone is ready; every phone gets a 5x5 board with FREE in the center | |
| 9 | Mark squares to complete a line; the "<Name> got a bingo!" banner shows on all phones | |
| 10 | Unmark and re-mark a square; marks persist and no duplicate Bingo banner appears | |
| 11 | Reload a phone mid-game; it returns to the same seat, board and marks | |
| 12 | Open the join link on a new device and join with an existing player's name; the host sees "Someone wants to take <Name>'s seat" and approves | |
| 13 | The displaced original phone shows "You've been replaced in this game." with a Home link | |
| 14 | Host ends the game; every phone shows the leaderboard | |

## iOS manual test

iOS hosts; two web phones (A, B) join. Build the PlayOYBC scheme to a device (real `GoogleService-Info.plist`), or a simulator with the launch arguments `-useEmulators YES -gameServer ws://127.0.0.1:8787` against `pnpm --filter server dev` and `firebase emulators:start --only auth --project demo-play-oybc` (see Local server › Local auth). Without the argument the app uses Info.plist `GameServerURL` (the Worker URL). The app suspends its room on background and resumes on active.

| # | Step | Expect |
| --- | --- | --- |
| 1 | iOS: launch, enter a name, tap Host a game | Lobby: code, QR, `https://play-oybc.web.app/g/<CODE>`, Copy link; you are listed with Host and You badges |
| 2 | iOS: tap Copy link, paste into Notes | The link above |
| 3 | Phone A scans the QR, joins as "Cody"; phone B types the code on the web home page, joins as "Pat" | Both appear in the iOS player list live; the iOS host sees "Cody needs 24 more tasks" / "Pat needs 24 more tasks" lines and the pool counter |
| 4 | iOS: type `@co`, tap Cody in the suggestions, finish "@Cody does the Monster Mash", tap Add | Pool updates on all three; on phone A the entry is a redacted bar with no text; iOS and B see the text |
| 5 | iOS: add tasks with `@someone` and `@anyone`; type a 121-character task | Blurring matches the web rules on each phone; the field stops at 120 characters |
| 6 | iOS: delete one of your tasks with ×, and (host) delete one of Pat's | Both disappear everywhere |
| 7 | Everyone adds tasks until the shortfall lines are gone and the counter reads at least 24 / 24 | Launch turns on (iOS only) |
| 8 | iOS: tap Launch | All three switch to a 5x5 board with Free in the center |
| 9 | iOS: tap a square, then tap it again | It turns red at once and back; no flicker, no error |
| 10 | iOS: press and hold a square with long text | A "Task" sheet shows the full text; Close dismisses it and the square is not toggled |
| 11 | iOS: start a drag on a square and scroll the page up and down | The page scrolls; the square neither toggles nor opens the Task sheet (long-press vs scroll) |
| 12 | Phone A completes a line | iOS shows "Cody got a bingo!" for about 4 s (tap dismisses it early); A sees no banner for its own bingo |
| 13 | iOS: complete a line | The five squares turn gold; A and B show "<host> got a bingo!"; iOS shows no banner for itself |
| 14 | iOS: tap Leaderboard | Sheet lists the bingos in order with #n and h:mm times |
| 15 | iOS: force-quit and relaunch the app | It returns to the same seat, board and marks without asking for a name |
| 16 | Phone B: open the join link in a new private window, join as "Cody" | iOS shows "Someone wants to take Cody's seat" with Allow / Deny; tap Deny: B shows "The host said no" |
| 17 | Phone B: join as "Cody" again; iOS taps Allow | B gets Cody's board; phone A shows "You've been replaced in this game." with a Home link |
| 18 | iOS: tap Host menu, tap Make host next to Pat, then Make host in the confirm sheet | Pat (B) now has End game and the Host menu; iOS loses them and the reclaim prompt |
| 19 | Phone B (new host): Host menu, make the iOS player host again | iOS gets End game and the Host menu back |
| 20 | iOS: tap End game, then End game in the confirm sheet | All three show the leaderboard and their final board; nothing is tappable |
| 21 | iOS: tap Home, relaunch the app | The home screen shows (the ended game is forgotten) |
| 22 | iOS: on Home, paste `https://play-oybc.web.app/g/<a live code>` into Game code and tap Join | The join screen for that code; joining seats you in the lobby |

## Known deploy issue (legacy Firebase backend): callables return 403

If calls fail with `403 Forbidden` before reaching the function, the Cloud Run services lack the public invoker binding (an org policy such as domain-restricted sharing blocks `allUsers`). Fix once per function: grant `allUsers` the `roles/run.invoker` role (Console: Cloud Run > service > Security > Allow unauthenticated invocations), or lift the org policy for project `play-oybc`.
