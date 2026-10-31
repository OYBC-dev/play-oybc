import type {
  BingoDoc,
  BoardDoc,
  CreateGameRes,
  GameDoc,
  JoinGameRes,
  PoolViewEntry,
  ReclaimDoc,
  RosterName,
  SeatDoc,
  Standing,
  ToggleMarkRes,
  WhoAmIRes,
} from 'game-core';

/** Tasks per board when a frame does not say (free space off). */
export const DEFAULT_TASKS_PER_BOARD = 25;

/**
 * The `game` section as clients see it: game-core's `GameDoc` plus the room's options and per-seat pool
 * counts. The extra fields are optional (older frames and the legacy backend omit them); read them through
 * `freeSpaceOf` / `tasksPerBoardOf` / `dealableFor`.
 */
export type SnapshotGame = GameDoc & {
  freeSpace?: boolean;
  /** Tasks each board needs: 24 with free space, else 25. */
  tasksPerBoard?: number;
  /** seatId → tasks guaranteed dealable to that seat. */
  dealable?: Record<string, number>;
};

/** Whether the board centre is free (false when the frame does not say). */
export const freeSpaceOf = (game: SnapshotGame): boolean => game.freeSpace ?? false;
/** Tasks each board needs (`DEFAULT_TASKS_PER_BOARD` when the frame does not say). */
export const tasksPerBoardOf = (game: SnapshotGame): number => game.tasksPerBoard ?? DEFAULT_TASKS_PER_BOARD;
/** Tasks dealable to `seatId` (0 when the frame does not say). */
export const dealableFor = (game: SnapshotGame, seatId: string): number => game.dealable?.[seatId] ?? 0;

/** Everything one seat can see of a game, merged from the server's listeners. */
export interface GameSnapshot {
  game: SnapshotGame;
  mySeatId: string;
  seats: Array<SeatDoc & { seatId: string }>;
  view: PoolViewEntry[];
  board: BoardDoc | null;
  bingos: BingoDoc[];
  /** The leaderboard in server order; empty before launch or when the frame does not carry it. */
  standings: Standing[];
  /** Pending reclaims; only populated while this seat is the host. */
  reclaims: Array<ReclaimDoc & { id: string }>;
  /** Names tasks refer to that no seat owns, in order of first mention, with the host's binding; `[]` when the frame does not carry it. */
  roster: RosterName[];
}

/** The only door between UI and backend: callables for writes, listeners for reads. */
export interface GameClient {
  createGame(name: string): Promise<CreateGameRes>;
  joinGame(code: string, name: string): Promise<JoinGameRes>;
  whoAmI(code: string): Promise<WhoAmIRes>;
  subscribe(
    gameId: string,
    seatId: string,
    onChange: (s: GameSnapshot) => void,
    onError: (e: Error) => void,
  ): () => void;
  /** Adds a task; `taskId` (client-generated, idempotent on retry) lets the caller match the row it shows early. */
  addTask(gameId: string, text: string, taskId?: string): Promise<void>;
  deleteTask(gameId: string, taskId: string): Promise<void>;
  launch(gameId: string): Promise<void>;
  /** Host, lobby only: sets the game's options. */
  setOptions(gameId: string, options: { freeSpace: boolean }): Promise<void>;
  /** Host: binds the roster name `key` to a joined seat, or unbinds it (`seatId` null). */
  bindName(gameId: string, key: string, seatId: string | null): Promise<void>;
  /**
   * Host, lobby only: takes the roster name `key` off the roster and drops the hold on its tasks (they turn
   * ordinary: visible to everyone, dealt like any task). The task text keeps the mention.
   */
  retireName(gameId: string, key: string): Promise<void>;
  /** Sets the square to `marked` (idempotent on retry). */
  toggleMark(gameId: string, cellIndex: number, marked: boolean): Promise<ToggleMarkRes>;
  end(gameId: string): Promise<void>;
  resolveReclaim(gameId: string, reclaimId: string, approve: boolean): Promise<void>;
  transferHost(gameId: string, toSeatId: string): Promise<void>;
  watchReclaim(gameId: string, reclaimId: string, onStatus: (s: ReclaimDoc['status']) => void, onError?: (e: Error) => void): () => void;
  /** Lets go of the game on this device (its connection closes); the seat stays, so rejoining by code resumes it. */
  leave(gameId: string): void;
}
