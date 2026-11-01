# Play OYBC — Split + MVP Design

**Date:** 2026-10-22 · **Owner:** Stephen · **Status:** draft for approval
**Supersedes:** the 2026-07-06 "monorepo co-habit" decision (`docs/PLAY_TRANSITION.md`, `docs/play/PLAY_OYBC.md` §10) in the oybc repo.

---

## 1. Intent

Play OYBC is a real-time party-bingo game: a group in one room builds a shared pool of
"things that might happen tonight," each player gets their own random board from that
pool, and people race to get bingos. It comes from years of hand-made party bingo boards
and janky generators with no live collaboration (origin story: oybc `docs/play/PLAY_OYBC.md` §2,
carried into the new repo).

Two things are happening at once:

1. **The split.** Play stops living inside the oybc (Do) monorepo. It becomes its own
   project — own repo, own Firebase project, own copies of any reused code. Nothing is
   shared live. Reason: Play's state model is the inverse of Do's, and future Play
   variants will themselves be forked off Play; a clean standalone base is the right
   unit to fork.
2. **The MVP.** First real use is the **Halloween party, 2026-10-31**: 30–40 guests,
   ~10–20 players, all in one room, on their own phones. Mobile web is the priority
   surface (guests join via link/QR, no install); a **native SwiftUI iOS app** ships in the
   MVP too, via TestFlight, for the owner's personal use.

**Success:** at the party, ~15 people join from a QR code in under a minute each, build a
pool together live, get dealt boards, and see "*Name* got a bingo!" pop up through the
night — with no one losing their board when their phone locks.

## 2. Goals / non-goals / anti-goals

**Goals**
- Live, collaborative pool building that every player watches grow.
- Per-player random boards, dealt by the server.
- @mention tasks with per-player hiding (§4.3) — the social core of the game.
- Bingo announcements to everyone, live; leaderboard of bingos in order, visible anytime.
- Rock-solid rejoin: reopening the link/app returns you to your board, marks intact.
- Mobile web + native iOS, same backend.

**Non-goals (MVP)**
- Accounts, profiles, history across games, saved pools.
- Other modes (teams, baseball, geo). Monetization, moderation/reporting, App Store
  public release, age rating. (All tracked in the carried-over design doc as later gates.)
- Offline play. Play is online-required.
- Remote/distributed play tuning (it may work; not designed for).

**Anti-goals (would make it a failure even if it "works")**
- Hidden task text reachable from the client (network tab, local cache, devtools).
  "Blurred" means the server never sent that player the text.
- A player losing their board or marks because their phone slept / browser was closed.
- Any join friction beyond "scan, type a name."
- Any runtime coupling back to the oybc repo or `oybc-dev-e2668`.

## 3. The split

### 3.1 New home
- **New GitHub repo**, fresh history (files copied, no `git filter-repo`). Name: builder's
  call (suggest `2014sheas/play-oybc`).
- **New Firebase project** (brand new — not `socialbingo-b6670`, not `oybc-dev-e2668`).
  Needs Anonymous Auth enabled, Firestore, Functions (Blaze), Hosting.

### 3.2 Copied into the new repo (then owned and free to diverge)
| From oybc | To new repo | Notes |
| --- | --- | --- |
| `packages/bingo-core/src/*` + `tests/*` (incl. seeded RNG, detection + placement vectors) | `packages/game-core` | Starting point for server game logic. |
| `packages/riso-tokens/riso.css` | `web/` styles | Riso look carries over. |
| Selected `apps/web/src/components/riso/*` primitives | `web/` components | Only what Play uses (likely Button, Chip, Card, SectionLabel, Segmented, BrandMark). Not Do-specific ones (TapLogChipRow, TypeBadge, UndoPill, DiceButton…). |
| iOS Riso theme (`apps/ios/OYBC/Views/Riso/RisoTheme.swift`, `RisoControls.swift` as needed) | `ios/` | Same look on iOS. |
| `docs/play/PLAY_OYBC.md` | `docs/PLAY_OYBC.md` | Rewritten: architecture §6 resolved per this doc; decisions log updated; "single bingo wins / game continues" replaces "first to finish". |
| `apps/play` scaffold | — | Not carried; superseded by the new `web/`. |
| Do's Swift bingo mirrors (`BingoDetection.swift` etc.) | — | Not needed: server computes lines (§5.4). |

### 3.3 Removed from oybc (one cleanup PR there, after the new repo exists)
`apps/play/`, `.github/workflows/play.yml`, `functions/src/validateWin.ts` +
`functions/test/validateWin.test.ts` + its export in `functions/src/index.ts`, the Play
entries in `.github/dependabot.yml` / `codeql.yml` / `web.yml`/`functions.yml` path filters,
the "Two products, one repo" section and Play references in root `CLAUDE.md`,
`docs/PLAY_TRANSITION.md`, `docs/play/`, ROADMAP Track G (replaced by a one-line pointer
to the new repo), and any other Play references found by grep (`apps/play`, `Play OYBC`,
`validateWin`). If `validateWin` was ever deployed to `oybc-dev-e2668`, delete it there.

### 3.4 Kept in oybc
`@oybc/bingo-core` and `@oybc/riso-tokens` stay as Do's own packages, code unchanged.
Their docs (`CLAUDE.md`, `MIRRORS.md`, package descriptions) drop the "shared with Play"
framing. Whether `functions/` still needs bingo-core after `validateWin` is gone: the
cleanup PR removes the dev-dependency/esbuild bundling only if nothing else uses it.

## 4. MVP requirements

### 4.1 Roles & identity
- **Host** creates the game and is also a player. Host-only actions: Launch, End,
  delete any task, (stretch) approve bingos.
- **Players** join with a **display name only**. Identity is a Firebase Anonymous Auth uid
  per device/browser; that uid is the player's key in the game, which makes rejoin
  automatic.
- Display names must be unique within a game (case-insensitive) — @mentions resolve by
  name at authoring time and are stored by uid.

### 4.2 Lifecycle
1. **Create.** Host enters their name → game created → host sees a short join code,
   join link, and QR code.
2. **Lobby / pool building (live, at the party).** Players join; everyone sees the player
   list and the pool update live. Anyone can add tasks. A task can be deleted by its
   author or the host.
3. **Launch.** Host taps Launch (enabled once the pool can fill a board — §4.4). Pool
   locks. Server deals one board per player.
4. **Play.** Players tap squares to mark/unmark on their own board (honor system). Board
   highlights completed lines.
5. **Bingo.** When a mark completes a line the player didn't already have, a leaderboard
   entry is added and every other player sees an in-app banner: "*Name* got a bingo!"
   The game continues; later bingos (by anyone, including second lines by the same
   player) are announced the same way.
6. **Late join.** A player joining after Launch gets a board dealt from the locked pool
   under the same rules, and plays normally.
7. **End.** Host taps End. Marking stops. Everyone sees the final leaderboard.
- **Leaderboard** is viewable at any time during play and after End. Since 2026-10-30 it ranks
  players (bingo count, squares marked, best line) — see `docs/PARTY_FEATURES.md` §4; the
  per-bingo list described in the original design is retired.

### 4.3 @mention tasks
Three forms, typed inline in task text:

| Form | Example | Who sees text in the pool | Who can be dealt it | Meaning on a board |
| --- | --- | --- | --- | --- |
| `@Name` | "@Cody says his catchphrase" | everyone except Cody | everyone except Cody | as written |
| `@someone` | "@someone takes a shot" | **only the author** | everyone | resolved at deal time to a random player other than the board's owner ("Seth takes a shot") |
| `@anyone` | "@anyone goes to the bathroom" | **only the author** | exactly one board (assigned at launch; `docs/PARTY_FEATURES.md` §2) | counts if any player other than the board's owner does it |

- Blurred entries show that a task exists (and its author) but carry **no text** in what
  the server sends that player.
- `@Name` is picked from an autocomplete of joined players, or typed for someone not
  here yet (`docs/ROSTER.md`; the party cut in `docs/PLAN_ROSTER.md` Phase 0). A name
  nobody has yet is an **unbound name**: the task is kept from every player the pool
  does not refer to by name (any of them might be that person) and binds itself the
  moment someone joins under that name. A task may mention more than one `@Name`; it
  is then hidden from / never dealt to each of them.
- A task mentioning its own author by `@Name` is rejected (it would be hidden from the
  only person who wrote it).
- Mentions are resolved against the current players whenever the pool, a board or the
  readiness counts are built, so a task written about someone who joins later becomes
  theirs on arrival (hidden from them, never dealt to them, shown bold to the rest).

### 4.4 Boards & dealing
- **5×5; the FREE center is a host option, off by default** (`docs/PARTY_FEATURES.md` §3). 25 tasks per board without it, 24 with it. Mentions render as bold names without the `@`; marked squares are red (plain), gold (reference) or green (in a completed line).
- **Launch is enabled** only when **every** player's eligible pool (pool minus tasks that
  `@Name` them) has ≥ the board's task count (25, or 24 with free space on). Until then the lobby shows who is short and by how
  many ("Cody needs 3 more tasks"). *(Owner decision.)* Late joiners can't be `@Name`d
  (they weren't present when tasks were written), so their eligible pool is the whole
  pool minus the `@anyone` tasks already on a board (since 2026-10-30; `docs/PARTY_FEATURES.md` §3) — normally ≥ the board's task count.
- Dealing is a per-player random draw from that player's eligible pool, with
  `@someone` resolved per board. Dealt boards are stored and never re-dealt.
- Marks: tap toggles. Unmarking a square that was part of an already-announced bingo
  does **not** retract the leaderboard entry (stretch review gate is the anti-cheat tool).
- Each board stores the set of lines it has **ever** announced. A line is announced at
  most once per board, so unmark/re-mark can't flood the leaderboard. *(Builder-check
  call.)*

### 4.5 Rejoin / resilience
- Reopening the link (web) or app (iOS) on the same device lands the player back in the
  current game in its current stage, board and marks intact.
- Live views recover after the network drops and returns, without a manual refresh.
- **Seat reclaim** (identity lost — QR opened in a private tab / in-app browser then
  reopened in Safari, site data cleared, new phone): the player types their existing
  name on the join screen → the host gets "Someone wants to take *Name*'s seat" → on approve, the
  seat's uid is replaced with the new one and they get their board, marks and pool view
  back. On deny, nothing changes. *(Owner decision.)*
- **Host hand-off:** the host can pass the host role to any player (who then has every
  host power, including approving reclaims). Covers a dying host phone. *(Owner
  decision.)*
- **Leave game:** in the lobby a guest's Leave gives the seat up on the server (out of the
  players list and readiness; tasks they wrote stay, mentions of them go back on the roster);
  they rejoin by code as a newcomer. The host, and anyone once the game is playing, keep their
  seat and only let go on the device. See `docs/ROSTER.md` §9.

### 4.6 Stretch: host review gate
When on (per-game host toggle, default off), a new bingo goes to the host as **pending**
with that player's board (marked squares + task text) visible to the host. Host approves
→ announced and added to the leaderboard; host rejects → dropped (player's marks
untouched). Built only after everything in §4.1–4.5 works on both platforms.
Squares on the pending board whose task `@Name`s the host stay blurred for the host
(hiding rules beat review). *(Builder-check call.)*

### 4.7 Platform scope & cutline
- **Web and iOS are feature-equivalent**, including hosting (create, QR, Launch, End,
  reclaim approvals, hand-off) — the owner is the likely host and will host from iOS.
- **Build order / cutline:** web is the surface the party depends on, so each feature
  lands on web first; if the date gets tight, iOS trails rather than web. *(Builder-check
  call, from the owner's stated "prioritizing mobile web".)*

## 5. Architecture (decided)

§5.1–5.4 are superseded by `docs/REALTIME_SERVER.md`.

### 5.1 Stack
- **Backend:** Firebase — Anonymous Auth, Firestore, Cloud Functions (TypeScript, Node 22),
  Hosting for the web app.
- **Owner action items (block deploys / TestFlight — first in the plan):** create the
  new Firebase project on Blaze with billing, enable Anonymous Auth; create the new iOS
  bundle ID + App Store Connect app record. *(Builder-check call.)*
- **Web:** React + Vite + TypeScript, mobile-first, Riso tokens/components (copied).
- **iOS:** native SwiftUI, XcodeGen, Firebase iOS SDK (Auth + Firestore + Functions),
  distributed via TestFlight.
- **Repo:** single repo, e.g. `web/`, `ios/`, `functions/`, `packages/game-core/`, `docs/`.
  pnpm workspace for the TS parts (the oybc functions bundling trap applies: Firebase's
  cloud installer can't resolve workspace deps, so `functions/` bundles `game-core` with
  esbuild — same proven pattern as oybc T6).

### 5.2 Server-authoritative
- **Every write is a callable Cloud Function:** `createGame`, `joinGame`, `addTask`,
  `deleteTask`, `launchGame`, `toggleMark`, `endGame`, (stretch) `reviewBingo`.
- **Clients never write Firestore.** Security rules deny all client writes; clients only
  read via listeners on documents scoped to them.
- Functions validate caller uid, game stage, and permission (host-only actions).
- Keep at least one warm instance (`minInstances: 1`) for the party to avoid cold-start
  lag; cost is a few dollars for the night.

### 5.3 Per-player views (how hiding works)
- Canonical task text lives in server-only docs (rules: no client reads).
- On every pool change, a function writes each player's **pool view** — one doc per
  (player, task), or one doc per player holding the list; builder's call — with blurred
  entries containing no text. ~20 players × ~60 tasks is trivially cheap.
- A new player's pool view is written on join.
- Shared, non-secret state (stage, player list, leaderboard) lives in docs every player
  in the game can read.
- Each dealt board is readable only by its owner (and, for the stretch gate, the host).

### 5.4 Game logic lives on the server
- Dealing, `@someone` resolution, `@Name` exclusion, line detection, and leaderboard
  ordering run in Functions using `packages/game-core` (copied bingo-core + new deal and
  mention logic, unit-tested with seeded RNG).
- `toggleMark` updates the board, runs detection, writes the board's completed lines
  back, and appends leaderboard entries for new lines (transactionally, so two
  simultaneous bingos get a well-defined order).
- Clients render server state, including which lines to highlight — **no game logic in
  Swift**, no TS↔Swift mirrors.
- Bingo banner: clients listen to the leaderboard and show a banner for entries that
  arrive after they loaded (not for their own, and not a flood of old ones on rejoin).

### 5.5 Joining
- Short human-friendly game code (e.g. 4–6 chars, no ambiguous characters) + link
  `…/g/<code>` + QR shown on the host's screen.
- Opening the link on web: sign in anonymously → if already a player in that game,
  resume; else name prompt → join.
- iOS: enter code (or open link if universal links are cheap; otherwise code entry only —
  builder's call).

## 6. Left to the builder
Folder names, exact Firestore document layout within §5.3's constraints, UI layout
details within the Riso look, code format, test framework choices, CI setup, web hosting
domain (default Firebase Hosting URL is fine for Halloween; `play.oybc.com` later).

## 7. Decisions log (this doc)
| Decision | By |
| --- | --- |
| Play is a standalone repo + new Firebase project; reused code is copied, never shared | Owner |
| Halloween 2026-10-31 is the first real game; ~10–20 players, one room | Owner |
| Mobile web first; native SwiftUI iOS in the MVP via TestFlight | Owner |
| Pool built live at the party; single bingo is a win; game continues; host ends | Owner |
| Leaderboard of bingos in order, visible anytime | Owner |
| `@Name` / `@someone` / `@anyone` rules (§4.3) | Owner |
| Late join allowed | Owner |
| Launch blocked until every player has ≥ 24 eligible tasks | Owner |
| Host-approved seat reclaim + host hand-off | Owner |
| Host review gate is a stretch goal | Owner |
| Firebase, server-authoritative, per-player views, logic server-only | Proposed by Claude, approved by owner |
| Name-only join, unique names, anyone adds / author-or-host deletes, 5×5 FREE center, honor-system marking | Claude's calls, not objected to |
| Announce a line once ever per board; blur host-mentioning squares in review; web-first cutline; owner action items first | Claude's calls (builder check) |

No open questions remain.
