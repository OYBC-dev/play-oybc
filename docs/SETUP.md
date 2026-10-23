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
- `VITE_USE_EMULATORS=` (`true` connects auth/firestore/functions emulators)

## Emulator commands

- Start all: `firebase emulators:start`
- (to fill in by later tasks)

## Deploy

```bash
cp .setup-secrets/web.env.local web/.env.local   # gitignored
pnpm --filter web build
firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
```

Functions read `MIN_INSTANCES` from `functions/.env.play-oybc` (emulators use `functions/.env.demo-play-oybc`).

## Load check

`scripts/loadTest.ts` joins 20 anonymous seats to a game on the deployed project, adds 60 tasks concurrently, launches, fires 200 random `toggleMark` calls, and asserts: no failed calls, `bingoCount` equals the number of bingo docs, seqs are 1..n with no gaps, median `toggleMark` under 800 ms. Failures are counted, never retried.

```bash
pnpm --filter scripts load
```

## Party-day runbook

1. Morning of 10-31: set `MIN_INSTANCES=1` in `functions/.env.play-oybc`, then `firebase deploy --only functions`.
2. Next day: set `MIN_INSTANCES=0` and run `firebase deploy --only functions` again.

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
| 12 | Open the join link on a new device and join with an existing player's name; the host sees "<Name> wants back in" and approves | |
| 13 | The displaced original phone shows "You've been replaced in this game." with a Home link | |
| 14 | Host ends the game; every phone shows the leaderboard | |

## Known deploy issue: callables return 403

If calls fail with `403 Forbidden` before reaching the function, the Cloud Run services lack the public invoker binding (an org policy such as domain-restricted sharing blocks `allUsers`). Fix once per function: grant `allUsers` the `roles/run.invoker` role (Console: Cloud Run > service > Security > Allow unauthenticated invocations), or lift the org policy for project `play-oybc`.
