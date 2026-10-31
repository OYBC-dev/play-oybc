import type { BoardCell } from './deal';
import type { PoolViewEntry, TaskMentions } from './types';

/** Game lifecycle stage. */
export type Stage = 'lobby' | 'playing' | 'ended';

/** codes/{code} */
export interface CodeDoc { gameId: string }
/** games/{gameId}; timestamps are epoch ms. */
export interface GameDoc {
  code: string;
  stage: Stage;
  hostSeatId: string;
  createdAt: number;
  launchedAt?: number;
  endedAt?: number;
  bingoCount: number;
  shortfalls: Record<string, number>;
  reviewGate: boolean;
  /** The host's optional title for the game (≤ 40 chars, trimmed; absent when not set). */
  gameName?: string;
}
/** games/{g}/members/{uid} */
export interface MemberDoc { seatId: string }
/** games/{g}/seats/{seatId} */
export interface SeatDoc { name: string; nameKey: string; joinedAt: number }
/** games/{g}/tasks/{taskId} */
export interface TaskDoc { text: string; authorSeatId: string; mentions: TaskMentions; createdAt: number }
/** games/{g}/views/{seatId} */
export interface ViewDoc { entries: PoolViewEntry[]; updatedAt: number }
/** games/{g}/boards/{seatId} */
export interface BoardDoc {
  cells: BoardCell[];
  marks: boolean[];
  completedLines: string[];
  announcedLines: string[];
}
/** games/{g}/bingos/{bingoId} */
export interface BingoDoc {
  seq: number;
  seatId: string;
  name: string;
  line: string;
  playerBingoNumber: number;
  at: number;
  status: 'announced' | 'pending' | 'rejected';
}
/** games/{g}/reclaims/{reclaimId} */
export interface ReclaimDoc {
  requesterUid: string;
  name: string;
  seatId: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: number;
  /** When the reclaim was approved or denied (absent on older docs). */
  resolvedAt?: number;
}

/** `name` is the host's display name; `gameName` (≤ 40 chars, optional) and `freeSpace` (default false) are the game's settings, locked at creation. */
export interface CreateGameReq { name: string; gameName?: string; freeSpace?: boolean }
/** Longest game name accepted by `createGame`. */
export const MAX_GAME_NAME_LENGTH = 40;
export interface CreateGameRes { gameId: string; code: string; seatId: string }
/** A requester whose reclaim of a seat was denied must wait this long before asking for it again. */
export const RECLAIM_RETRY_COOLDOWN_MS = 60_000;
/** `reclaim` asks for the seat already held under `name` (the lost-phone case); without it a taken name is `name-taken`. */
export interface JoinGameReq { code: string; name: string; reclaim?: boolean }
export type JoinGameRes =
  | { status: 'joined' | 'resumed'; gameId: string; seatId: string }
  | { status: 'reclaim-pending'; gameId: string; reclaimId: string };
export interface WhoAmIReq { code: string }
export type WhoAmIRes = { gameId: string; seatId: string } | null;
export interface AddTaskReq { gameId: string; text: string }
export interface AddTaskRes { taskId: string }
export interface DeleteTaskReq { gameId: string; taskId: string }
export interface LaunchGameReq { gameId: string }
/** `marked` sets the square to that value (idempotent); omitted = flip (0.1.0 clients send none). */
export interface ToggleMarkReq { gameId: string; cellIndex: number; marked?: boolean }
export interface ToggleMarkRes { marks: boolean[]; completedLines: string[]; newBingoSeqs: number[] }
export interface EndGameReq { gameId: string }
export interface ResolveReclaimReq { gameId: string; reclaimId: string; approve: boolean }
export interface TransferHostReq { gameId: string; toSeatId: string }
