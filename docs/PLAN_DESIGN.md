# Play OYBC design pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the high-fidelity "Play OYBC" design handoff on mobile web and iOS without changing game rules.

**Architecture:** Visual/layout/copy pass over existing screens. Web: Vite + React, `web/src/components/riso` kit, tokens in `web/src/styles/riso.css`. iOS: SwiftUI, `ios/PlayOYBC/Riso` kit + asset-catalog colorsets. One logic change: board cells display resolved mentions (game-core `deal.ts`, server-side).

**Tech Stack:** React 18 + Vite + Vitest/RTL + Playwright; SwiftUI + XCTest + swift-snapshot-testing; Firebase callables (functions/), game-core (TS).

**Spec:** `design_handoff_play_oybc/README.md` (gitignored, local; binding for look, layout, copy) + `design_handoff_play_oybc/Play OYBC.dc.html` (reference states; colorway CSS in its `<style>`). Gap map: `.superpowers/sdd/PLAN_DESIGN/design-gap.md`. Game rules: `docs/DESIGN.md` (unchanged).

## Global Constraints

- Never hard-code hex in UI components; read `--riso-*` tokens (web) / `Color.riso*` (iOS). Static exceptions only: QR tile cream `#fbf6ea` with `#18120b` border.
- Colorway: **harvest only**, hard-coded (`data-pt="harvest"` on `<html>`); no picker. Web dark mode follows `prefers-color-scheme` (inline script in `web/index.html`, no flash) and updates on change. iOS follows system via asset appearances.
- No helper copy: labels, values, controls only. Copy is verbatim from README §Copy, EXCEPT the reclaim prompt, which stays "Someone wants to take {Name}'s seat" (owner ruling 2026-10-24).
- Always "Bingo", never "BINGO". No drinking references.
- Min tap target 44px. Keylines 2px. Radii card 8 / cell 7 / pill 999.
- Respect `prefers-reduced-motion` (web) / `accessibilityReduceMotion` (iOS): no confetti, no spring, instant banner swaps.
- Blurred pool rows: the client never receives hidden text; nonsense string length is pseudo-random seeded by `taskId` (client-only).
- No new dependencies (web QR = existing `qrcode.react`; iOS QR = CoreImage).
- Keep (not designed, still shipped): Join loading/failed + "Try again", "You've been replaced in this game.", long-press task detail, iOS Resume card on Home, "Copied" transient label after Copy link.
- iOS builds: `-derivedDataPath /Volumes/Stephen/play-oybc-derived -clonedSourcePackagesDirPath /Volumes/Stephen/play-oybc-spm`; local simulators are unavailable (Xcode 26.6 lacks the iOS 26.5 platform) → iOS tests and snapshot recording run on CI (record via a throwaway branch, read every PNG, delete the branch). Never drive a simulator.
- Never commit `design_handoff_*/`, `.setup-secrets/`, `.env.local`, or the real `GoogleService-Info.plist`.

## Review Focus

1. Dark mode on web: every screen readable in harvest dark (on-color text on rust/olive fills, ink-static on gold, QR stays cream).
2. Bottom sheet over iOS Safari's bottom bar and the keyboard: Launch reachable, composer not hidden when typing on a 390px phone.
3. A burst of 3+ bingos within a second: stack renders, each dismisses after 4s, none lost, own bingos still suppressed.
4. Long pool text (120 chars) and long names (24+ chars) in rows, chips, avatars, banners, cells (5-line clamp) without overflow.
5. Mentions on the board: `@Name` where Name is a prefix of another player's name (longest match wins); `@anyone` → "Anyone"; `@someone` unchanged behaviour.

---

### Task W1: Web theme foundation (S)
**Files:** `web/index.html`, `web/src/styles/riso.css`, `web/src/main.tsx` or a new `web/src/theme.ts` (+ test), page root using `.riso-grain`.
- [ ] Failing Vitest for `applyTheme(doc, matchMedia)`: sets `data-pt="harvest"`, `data-theme` light/dark from the media query, flips on change.
- [ ] Replace token values with harvest light/dark (README §Colorways, values verbatim from the reference `<style>` `[data-pt='harvest']` blocks) as compound selectors `[data-pt='harvest']` / `[data-pt='harvest'][data-theme='dark']`; drop other colorways.
- [ ] Inline no-flash script in `index.html`; grain on the page surface.
- [ ] Vitest + `pnpm --filter web build` + lint pass; Playwright screenshot Home light and dark (emulate color scheme) — read them.
- [ ] Commit `feat(web): harvest colorway with system dark mode`.

### Task W2: Web kit additions (M)
**Files:** `web/src/components/riso/{PlayBrandMark,RisoBadge,RisoMiniBoardArt,Avatar,AvatarStack,RisoIcon}.tsx` (+ CSS modules), `web/src/game/avatars.ts` (+ test).
**Produces:** `PlayBrandMark({size:'header'|'home'})` (inline SVG per README §Brand mark: 44×34 / 110×85); `Wordmark` (OYBC + rotated Play stamp); `RisoBadge kind="expiring"`; `RisoMiniBoardArt`; `avatarFor(seat, index) -> {initials, fill}` (fill cycles red/blue/gold/green/paper-2 by join order; initials ≤2 chars, first letters of first two words, uppercase); `AvatarStack({seats, max, onToggle})` with +N bubble; `RisoIcon` names share/trash/dots/you/logout (port from oybc `apps/web/src/components/riso` where present).
- [ ] Failing tests for `avatarFor` (single word, two words, emoji/whitespace, cycle order) and AvatarStack +N.
- [ ] Implement; tests + build + lint pass. Commit.

### Task W3: Web Home + Join (S)
**Files:** `web/src/pages/HomePage.tsx`, `JoinPage.tsx` (+ tests). Spec README §1, §2.
- [ ] Update tests for copy/structure (SectionLabels, Host primary, Join blue, waiting pill with read-only input, denied red dot line, header kicker + code on Join).
- [ ] Implement; keep Try again / loading states. Tests, build, lint. Commit.

### Task W4: Web Lobby re-layout (L)
**Files:** `web/src/pages/lobby/*` (LobbyScreen, ShareCard→BottomSheet, PlayerList→AvatarStack/chip list, PoolList, AddTaskForm, MentionAutocomplete, LaunchBar), tests. Spec README §3, §4.
- [ ] Tests: header "Pool"+"{n} / 24"; avatar stack toggles chip list with Host badge; composer placeholder "Add to the pool" + neutral Add; trash only on own rows (host: all); blurred row shows no task text and two blurred copies with deterministic length per taskId; empty state ("Waiting for players" pill, MiniBoardArt + "No tasks yet"); sheet shows code, red shortfall lines "{Name} needs {n} more task(s)", Launch disabled until ready; ready → sheet class/olive + Launch `dark`; QR tap expands (160px, Copy link, Done); player variant: no QR/Launch, has Copy link.
- [ ] Host "Make host" in the lobby: same dots-menu component as the Board header (W5 builds it; W4 leaves the current HostMenu entry working).
- [ ] Implement; e2e (`web/e2e`) still green; Playwright screenshots host-empty, host-filling, host-ready, player, light+dark at 390×844 — read them. Commit.

### Task W5: Web Board + host menu + dialogs + mention display (M)
**Files:** `web/src/pages/play/{PlayScreen,BoardGrid}.tsx`, `web/src/pages/host/{HostMenu,MakeHostDialog,EndGameDialog}.tsx`, lobby header wiring; `packages/game-core/src/deal.ts` (+ test); e2e `fullGame.spec.ts`.
- [ ] game-core failing tests: dealt cell text resolves `@Name`→`Name` (longest seat-name match, case as written in seat name), `@anyone`→`Anyone`, `@someone` unchanged existing behaviour; tasks without mentions unchanged.
- [ ] Board header (code pill, Leaderboard neutral small, host-only dots button) → 216px popover (Make host / red End game); Make host centered radio dialog (Make host item disabled when no other players — no copy); End game dialog with README copy. Same menu in lobby header (Make host + End game).
- [ ] Cells per README §5 (Free ink cell, gold+halftone on completed lines, in-flight opacity .55 + no shadow, transition `opacity .3s ease .25s`).
- [ ] Tests, build, lint, functions tsc, e2e; screenshots. Commit.

### Task W6: Web bingo banner stack + confetti (M)
**Files:** `web/src/pages/play/{BingoBanner,useBingoBanners}.ts(x)`, new `Confetti.tsx` (+ tests).
- [ ] Tests: hook exposes ordered queue; 3 arrivals → 3 rendered, front rotated, others offset; each dismissed after 4s (fake timers); own bingo suppressed; reduced-motion → no confetti element.
- [ ] Implement per README §6 with token colors. Commit.

### Task W7: Web Leaderboard sheet + Ended (S)
**Files:** `web/src/pages/play/{Leaderboard,Sheet,EndedScreen}.tsx` (+ tests). README §7, §9.
- [ ] Tests: "Done" ghost button; empty "No bingos yet" + art; pill gold for #2+; Ended kicker "Ended · CODE", "Final leaderboard", "Your board", "New game" navigates home.
- [ ] Implement. Commit.

### Task W8: Web reclaim toast + web deploy (S)
**Files:** `web/src/pages/host/ReclaimPrompt.tsx` (+ test).
- [ ] Toast layout per README §8 with shipped copy "Someone wants to take {Name}'s seat"; Allow green / Deny neutral, 50% each.
- [ ] Full web suite + e2e green on CI. Controller deploys functions (W5 deal change) + hosting after review.

### Task I1: iOS theme foundation (S)
**Files:** `ios/PlayOYBC/Resources/Assets.xcassets/*.colorset` (13), `Riso/RisoTheme.swift`, `Riso/RisoControls.swift` (add `ghost`, `dark` kinds), QR tile cream; all snapshot baselines re-recorded on CI.
- [ ] Re-value colorsets to harvest light/dark; radii 8/7; keyline 2; shadows 2/3/5. Re-record baselines on CI, read every PNG. Commit.

### Task I2: iOS kit + Home + Join (M)
Brand mark (SwiftUI Shape/view), wordmark, badge, mini-board art, avatars (`AvatarFor` mirror of web helper + XCTest), Home + Join per README §1–2 and iOS frames (large titles Bricolage 800 34, 20px gutter). Keep Resume card. Snapshots light+dark.

### Task I3: iOS Lobby (L)
Mirror W4; bottom sheet above home indicator (38px bottom padding); share via `.sheet` medium detent. Snapshots: host empty/filling/ready, QR expanded, player, light+dark.

### Task I4: iOS Board + host menu + dialogs (M)
Mirror W5 (mention display comes from the server). Snapshots.

### Task I5: iOS banner stack + confetti (M)
Mirror W6 on `BingoBannerQueue`; XCTest for queue timing; snapshot of a 3-stack.

### Task I6: iOS Leaderboard + Ended + reclaim toast (S)
Mirror W7 + W8; `.sheet` medium detent. Snapshots. Then controller uploads TestFlight build 3 when the Xcode iOS platform is installed.
