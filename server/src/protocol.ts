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
