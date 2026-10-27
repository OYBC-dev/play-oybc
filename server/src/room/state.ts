import type { BingoDoc, BoardCell, PoolTask, ReclaimDoc, Seat, Stage, TaskMentions } from 'game-core';
import type { Persistence } from './persistence';

/** The single game row. `rev` is the change counter clients use to drop stale pushes. */
export interface GameRow {
  gameId: string; code: string; stage: Stage; hostSeatId: string; createdAt: number;
  launchedAt?: number; endedAt?: number; bingoCount: number; reviewGate: boolean; rev: number; lastMutationAt: number;
}
export interface SeatRow { seatId: string; name: string; nameKey: string; joinedAt: number }
export interface TaskRow { taskId: string; text: string; authorSeatId: string; mentions: TaskMentions; createdAt: number }
export interface BoardRow { seatId: string; cells: BoardCell[]; marks: boolean[]; completedLines: string[]; announcedLines: string[] }
export interface BingoRow extends BingoDoc { id: string }
export interface ReclaimRow extends ReclaimDoc { id: string }

/**
 * The room's whole state, held in memory and written through to a `Persistence` synchronously
 * by every mutator. Shortfalls and per-seat views are derived on demand, never stored.
 */
export class GameState {
  game: GameRow | null = null;
  seats = new Map<string, SeatRow>();
  /** uid → seatId */
  members = new Map<string, string>();
  tasks = new Map<string, TaskRow>();
  boards = new Map<string, BoardRow>();
  bingos: BingoRow[] = [];
  reclaims = new Map<string, ReclaimRow>();

  /** Loads everything from `p`. */
  constructor(private p: Persistence) {
    const l = p.load();
    this.game = l.game;
    for (const s of l.seats) this.seats.set(s.seatId, s);
    for (const [uid, seatId] of l.members) this.members.set(uid, seatId);
    for (const t of l.tasks) this.tasks.set(t.taskId, t);
    for (const b of l.boards) this.boards.set(b.seatId, b);
    this.bingos = [...l.bingos];
    for (const r of l.reclaims) this.reclaims.set(r.id, r);
  }

  /** Bumps `rev` and `lastMutationAt` on the stored game (no-op before a game exists). */
  private bump(): void {
    if (!this.game) return;
    this.game = { ...this.game, rev: this.game.rev + 1, lastMutationAt: Date.now() };
    this.p.putGame(this.game);
  }

  /** Creates or replaces the game row; the first write keeps the caller's `rev`, later ones bump the stored one. */
  putGame(g: GameRow): void {
    const rev = this.game ? this.game.rev + 1 : g.rev;
    this.game = { ...g, rev, lastMutationAt: Date.now() };
    this.p.putGame(this.game);
  }
  putSeat(s: SeatRow): void { this.seats.set(s.seatId, s); this.p.putSeat(s); this.bump(); }
  /** Membership is not visible state: does not bump `rev`. */
  putMember(uid: string, seatId: string): void { this.members.set(uid, seatId); this.p.putMember(uid, seatId); }
  /** Membership is not visible state: does not bump `rev`. */
  deleteMember(uid: string): void { this.members.delete(uid); this.p.deleteMember(uid); }
  putTask(t: TaskRow): void { this.tasks.set(t.taskId, t); this.p.putTask(t); this.bump(); }
  deleteTask(taskId: string): void { this.tasks.delete(taskId); this.p.deleteTask(taskId); this.bump(); }
  putBoard(b: BoardRow): void { this.boards.set(b.seatId, b); this.p.putBoard(b); this.bump(); }
  appendBingo(b: BingoRow): void { this.bingos.push(b); this.p.appendBingo(b); this.bump(); }
  putReclaim(r: ReclaimRow): void { this.reclaims.set(r.id, r); this.p.putReclaim(r); this.bump(); }

  /** Deletes every row of every table and forgets the game. */
  purge(): void {
    this.p.purge();
    this.game = null;
    this.seats.clear(); this.members.clear(); this.tasks.clear(); this.boards.clear(); this.reclaims.clear();
    this.bingos = [];
  }

  /** Seats in game-core's `Seat` shape. */
  seatList(): Seat[] {
    return [...this.seats.values()].map((s) => ({ seatId: s.seatId, name: s.name, joinedAt: s.joinedAt }));
  }
  /** Tasks in game-core's `PoolTask` shape. */
  poolTasks(): PoolTask[] {
    return [...this.tasks.values()].map((t) => ({
      id: t.taskId, text: t.text, authorSeatId: t.authorSeatId, mentions: t.mentions, createdAt: t.createdAt,
    }));
  }
  /** The seat a uid holds, or null. */
  seatOf(uid: string): string | null { return this.members.get(uid) ?? null; }
  /** Whether the uid holds the host's seat. */
  isHost(uid: string): boolean {
    const seat = this.seatOf(uid);
    return seat !== null && seat === this.game?.hostSeatId;
  }
}
