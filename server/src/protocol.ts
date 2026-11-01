import type { BingoDoc, BoardDoc, GameDoc, PoolViewEntry, ReclaimDoc, RosterName, SeatDoc, Stage, Standing } from 'game-core';
export type Section = 'game' | 'seats' | 'view' | 'board' | 'bingos' | 'standings' | 'reclaims' | 'roster';
export type Op = 'join' | 'leave' | 'addTask' | 'deleteTask' | 'launch' | 'mark' | 'end' | 'resolveReclaim' | 'transferHost' | 'setOptions' | 'bindName' | 'retireName';
export type ClientMsg =
  | { t: 'hello'; token: string; gameId?: string }
  | { t: 'act'; id: string; op: Op; args: Record<string, unknown> };
/**
 * The `game` section on the wire: game-core's `GameDoc` plus the room's options and per-seat pool counts.
 * `tasksPerBoard` is 24 with free space, else 25; `dealable` is seatId → tasks guaranteed dealable to that seat.
 */
export type WireGameDoc = GameDoc & { freeSpace: boolean; tasksPerBoard: number; dealable: Record<string, number> };
export interface StateMsg {
  t: 'state'; rev: number; game?: WireGameDoc; seats?: Array<SeatDoc & { seatId: string }>; view?: PoolViewEntry[];
  board?: BoardDoc | null; bingos?: BingoDoc[]; standings?: Standing[]; reclaims?: Array<ReclaimDoc & { id: string }>;
  /** Names the pool refers to that nobody here carries as their own, with the host's bindings (see game-core `buildRoster`). */
  roster?: RosterName[];
}
export type AckMsg = { t: 'ack'; id: string; ok: true; result: unknown } | { t: 'ack'; id: string; ok: false; code: string; details?: Record<string, unknown> };
export type ServerMsg =
  | { t: 'welcome'; uid: string; gameId: string; seatId: string | null; stage: Stage; rev: number; gameName?: string; hostName: string }
  | StateMsg | AckMsg
  | { t: 'reclaim'; id: string; status: ReclaimDoc['status'] }
  | { t: 'evicted'; reason: 'replaced' }
  | { t: 'error'; code: string };
/**
 * Close codes. 4001 / 4003 / 4004 are fatal to a client; `TRY_AGAIN` (1013, the token could not be checked
 * just now) and `SUPERSEDED` (1000 with reason `superseded`: the uid opened a fifth socket) are not.
 */
export const CLOSE = {
  BAD_TOKEN: 4001, EVICTED: 4003, NOT_FOUND: 4004, RATE_LIMITED: 4008, TOO_LARGE: 4013, TRY_AGAIN: 1013, SUPERSEDED: 1000,
} as const;
/** The close reason that marks a superseded socket; clients must not auto-reconnect on it. */
export const SUPERSEDED_REASON = 'superseded';
export const MAX_FRAME_BYTES = 64 * 1024;
