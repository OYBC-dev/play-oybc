import type {
  BingoDoc,
  BoardDoc,
  CreateGameRes,
  GameDoc,
  JoinGameRes,
  PoolViewEntry,
  ReclaimDoc,
  SeatDoc,
  ToggleMarkRes,
  WhoAmIRes,
} from 'game-core';

/** Everything one seat can see of a game, merged from the server's listeners. */
export interface GameSnapshot {
  game: GameDoc;
  mySeatId: string;
  seats: Array<SeatDoc & { seatId: string }>;
  view: PoolViewEntry[];
  board: BoardDoc | null;
  bingos: BingoDoc[];
  /** Pending reclaims; only populated while this seat is the host. */
  reclaims: Array<ReclaimDoc & { id: string }>;
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
  addTask(gameId: string, text: string): Promise<void>;
  deleteTask(gameId: string, taskId: string): Promise<void>;
  launch(gameId: string): Promise<void>;
  toggleMark(gameId: string, cellIndex: number): Promise<ToggleMarkRes>;
  end(gameId: string): Promise<void>;
  resolveReclaim(gameId: string, reclaimId: string, approve: boolean): Promise<void>;
  transferHost(gameId: string, toSeatId: string): Promise<void>;
  watchReclaim(gameId: string, reclaimId: string, onStatus: (s: ReclaimDoc['status']) => void): () => void;
}
