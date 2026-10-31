# Lobby v2 (2026-10-31): game settings before create, the expanding sheet, the task explainer

Status: design handoff approved by the owner 2026-10-31 ("Play OYBC Design Touchup v2", gitignored under `design_handoff_touchup/`); built the same day on top of the roster work (`docs/ROSTER.md`), in PR #15. Amends `docs/PARTY_FEATURES.md` §4 (the lobby Free space switch) and `docs/DESIGN.md` §3 (host flow).

## 1. Intent

Four changes to the pre-game flow, web and iOS alike:

1. **Game settings before the game exists.** Home → "Host a game" opens a Game settings screen (game name, Free space, the derived tasks-per-board) and creates the game from there. `createGame` carries the options; `setOptions` is no longer a lobby op (the server keeps it for one release).
2. **The lobby sheet loses the Free space switch.** Host: code, QR tile, Launch. Player: code, Copy link.
3. **The lobby sheet expands** (handle drag or QR tile tap): big QR + share, a readiness summary (bar, per-player shortfalls), the players list with per-player counts, Launch pinned at the bottom for the host.
4. **Player waiting copy**: "Waiting for host to start" only once the pool is ready; "Pool needs N more tasks" while filling.
5. **"How tasks work"**: a dialog shown once per device on first landing in a lobby, reopenable from an (i) bubble beside Add. Its two-line cards (Seen by / Dealt to, per task kind) are the only explanatory copy on the surface, approved in the handoff; `docs/DESIGN.md` §4.3 and `docs/PARTY_FEATURES.md` §2 are its source of truth.

## 2. Server

- `POST /api/createGame { name, gameName?, freeSpace? }`: `gameName` trimmed, whitespace-collapsed, ≤ 40 chars (`MAX_GAME_NAME_LENGTH`), stored only when non-empty; `freeSpace` default false; `invalid-argument` on a long name or a non-boolean. `claimGame` stores both at creation; the `game` table gains `gameName TEXT` (added in place on rooms that lack it).
- The `game` section carries `gameName` when set. Everything else (`tasksPerBoard`, `dealable`, `shortfalls`) is unchanged and feeds the readiness summary.
- `setOptions` is unchanged on the server and unused by the clients.

## 3. Clients

- Readiness derivations are pure and shared in spirit: `have = view.length`, `target = tasksPerBoard`, `ready = shortfalls empty`; a player's own line counts the entries they authored (`mine`); per-player rows show `dealable[seatId] / tasksPerBoard` with `· n more` when short, short first; when ready the list collapses to one row.
- The roster's "Launch?" confirm (unbound names) still runs before Launch.
- The explainer's seen flag is per device (`oybc.howto.seen` in localStorage / UserDefaults), set on dismiss; skipped on reconnect when the seat already authored pool entries.

## 4. Decisions

| Decision | Who |
|---|---|
| Settings lock at creation; no lobby-time options | Owner (handoff) |
| Expanded sheet = "Option 4 · readiness summary"; other canvas options rejected | Owner (handoff) |
| Per-player rows show `dealable / tasksPerBoard` (no per-author count on the wire) | Handoff fallback |
| Game name shown under "Pool" and on the Join header when set | Claude (handoff marked optional) |
