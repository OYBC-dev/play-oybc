import { dealableFor, tasksPerBoardOf, type GameSnapshot } from '../../game/GameClient';

/** One line under the readiness bar; `short` lines are drawn in the red text colour. */
export interface ReadinessLine {
  text: string;
  short: boolean;
}

/** The expanded sheet's readiness summary. */
export interface ReadinessSummary {
  /** Tasks in the pool (`view.length`). */
  have: number;
  /** Tasks each board needs (`tasksPerBoard`). */
  target: number;
  /** Bar fill, 0–100 (capped: a pool past the target reads full). */
  percent: number;
  /** Left of the row: `{have} of {target} in the pool`, or `Pool is full` once ready. */
  label: string;
  /** Right of the row: `Need {n} more` while filling; `Ready to launch` (host) / `Waiting on host` (player) once ready. */
  sub: string;
  /** Host: one line per short player. Player: one line about themselves. */
  lines: ReadinessLine[];
}

/** A row of the expanded sheet's players list. */
export interface PlayerRow {
  seatId: string;
  name: string;
  /** Join-order index (drives the avatar colour). */
  index: number;
  isHost: boolean;
  /** Tasks dealable to this seat. */
  dealable: number;
  /** Tasks each board needs. */
  target: number;
  /** Tasks this seat is still short (0 = set). */
  short: number;
}

/** Seats in join order. */
function seatsInOrder(snapshot: GameSnapshot) {
  return [...snapshot.seats].sort((a, b) => a.joinedAt - b.joinedAt);
}

/** Missing tasks for `seatId` (0 when the frame does not list it). */
export function shortfallOf(snapshot: GameSnapshot, seatId: string): number {
  return Math.max(0, snapshot.game.shortfalls[seatId] ?? 0);
}

/**
 * Whether the pool is ready to launch: still in the lobby and no seat is short. The same for host and
 * players (players derive it from `game.shortfalls` too).
 */
export function isPoolReady(snapshot: GameSnapshot): boolean {
  return snapshot.game.stage === 'lobby' && Object.values(snapshot.game.shortfalls).every((n) => n <= 0);
}

/**
 * Plain tasks still needed before launch: the largest shortfall (adding that many tasks everyone can be
 * dealt makes every seat whole). 0 when ready.
 */
export function tasksStillNeeded(snapshot: GameSnapshot): number {
  return Object.values(snapshot.game.shortfalls).reduce((m, n) => Math.max(m, n), 0);
}

/** Tasks this seat added to the pool (the entries the view marks as mine). */
export function authoredCount(snapshot: GameSnapshot): number {
  return snapshot.view.filter((e) => e.mine).length;
}

/**
 * The readiness summary at the top of the expanded sheet.
 *
 * @param snapshot Current game snapshot.
 * @param isHost Whether this seat hosts (the host sees per-player lines, a player one line about themselves).
 */
export function readinessSummary(snapshot: GameSnapshot, isHost: boolean): ReadinessSummary {
  const have = snapshot.view.length;
  const target = tasksPerBoardOf(snapshot.game);
  const ready = isPoolReady(snapshot);
  const percent = ready ? 100 : Math.min(100, Math.round((have / Math.max(target, 1)) * 100));
  const label = ready ? 'Pool is full' : `${have} of ${target} in the pool`;
  const sub = ready ? (isHost ? 'Ready to launch' : 'Waiting on host') : `Need ${tasksStillNeeded(snapshot)} more`;
  let lines: ReadinessLine[];
  if (isHost) {
    lines = playerRows(snapshot)
      .filter((r) => r.short > 0)
      .map((r) => ({ text: `${r.name} needs ${r.short} more`, short: true }));
  } else {
    const added = authoredCount(snapshot);
    const mine = shortfallOf(snapshot, snapshot.mySeatId);
    lines = [mine > 0
      ? { text: `You've added ${added} · ${mine} more to go`, short: true }
      : { text: `You've added ${added} · all set`, short: false }];
  }
  return { have, target, percent, label, sub, lines };
}

/**
 * The players list: every seat with `{dealable} / {tasksPerBoard}`, short players first (largest shortfall
 * first, then join order), the rest in join order.
 */
export function playerRows(snapshot: GameSnapshot): PlayerRow[] {
  const target = tasksPerBoardOf(snapshot.game);
  const rows = seatsInOrder(snapshot).map((s, index) => ({
    seatId: s.seatId,
    name: s.name,
    index,
    isHost: s.seatId === snapshot.game.hostSeatId,
    dealable: dealableFor(snapshot.game, s.seatId),
    target,
    short: shortfallOf(snapshot, s.seatId),
  }));
  return rows.sort((a, b) => {
    if ((a.short > 0) !== (b.short > 0)) return a.short > 0 ? -1 : 1;
    return b.short - a.short || a.index - b.index;
  });
}

/** The player's expanded footer: `Waiting for host to start` (with dots) once ready, else what the pool lacks (no dots). */
export function playerWaitingCopy(snapshot: GameSnapshot): { label: string; ready: boolean } {
  if (isPoolReady(snapshot)) return { label: 'Waiting for host to start', ready: true };
  const n = tasksStillNeeded(snapshot);
  return { label: `Pool needs ${n} more task${n === 1 ? '' : 's'}`, ready: false };
}

/** The host's expanded Launch label: `Launch` once ready, else `Launch · need {n} more`. */
export function launchLabel(snapshot: GameSnapshot): string {
  return isPoolReady(snapshot) ? 'Launch' : `Launch · need ${tasksStillNeeded(snapshot)} more`;
}
