import type { BingoRow, BoardRow, GameRow, ReclaimRow, SeatRow, TaskRow } from './state';

/** Everything a persistence layer hands back on load. */
export interface Loaded {
  game: GameRow | null; seats: SeatRow[]; members: Array<[string, string]>; tasks: TaskRow[];
  boards: BoardRow[]; bingos: BingoRow[]; reclaims: ReclaimRow[];
  /** Name bindings as `[key, seatId]` pairs (absent from stores written before the roster). */
  bindings?: Array<[string, string]>;
}

/** Synchronous write-through store behind `GameState`. */
export interface Persistence {
  load(): Loaded;
  putGame(g: GameRow): void;
  putSeat(s: SeatRow): void;
  putMember(uid: string, seatId: string): void;
  deleteMember(uid: string): void;
  putTask(t: TaskRow): void;
  deleteTask(taskId: string): void;
  putBoard(b: BoardRow): void;
  appendBingo(b: BingoRow): void;
  putReclaim(r: ReclaimRow): void;
  putBinding(key: string, seatId: string): void;
  deleteBinding(key: string): void;
  purge(): void;
}

/** In-memory `Persistence` for tests; stores JSON-cloned copies so reloads see what a real store would. */
export class MemoryPersistence implements Persistence {
  private game: GameRow | null = null;
  private seats = new Map<string, SeatRow>();
  private members = new Map<string, string>();
  private tasks = new Map<string, TaskRow>();
  private boards = new Map<string, BoardRow>();
  private bingos: BingoRow[] = [];
  private reclaims = new Map<string, ReclaimRow>();
  private bindings = new Map<string, string>();

  load(): Loaded {
    const c = <T>(v: T): T => structuredClone(v);
    return {
      // A row written before `freeSpace` existed migrates as `SqlPersistence` does: off in the lobby, on once dealt.
      game: this.game && { ...c(this.game), freeSpace: this.game.freeSpace ?? this.game.stage !== 'lobby' }, seats: c([...this.seats.values()]), members: [...this.members], tasks: c([...this.tasks.values()]),
      boards: c([...this.boards.values()]), bingos: c(this.bingos), reclaims: c([...this.reclaims.values()]),
      bindings: [...this.bindings],
    };
  }
  putGame(g: GameRow): void { this.game = structuredClone(g); }
  putSeat(s: SeatRow): void { this.seats.set(s.seatId, structuredClone(s)); }
  putMember(uid: string, seatId: string): void { this.members.set(uid, seatId); }
  deleteMember(uid: string): void { this.members.delete(uid); }
  putTask(t: TaskRow): void { this.tasks.set(t.taskId, structuredClone(t)); }
  deleteTask(taskId: string): void { this.tasks.delete(taskId); }
  putBoard(b: BoardRow): void { this.boards.set(b.seatId, structuredClone(b)); }
  appendBingo(b: BingoRow): void {
    const i = this.bingos.findIndex((x) => x.id === b.id);
    if (i >= 0) this.bingos[i] = structuredClone(b); else this.bingos.push(structuredClone(b));
  }
  putReclaim(r: ReclaimRow): void { this.reclaims.set(r.id, structuredClone(r)); }
  putBinding(key: string, seatId: string): void { this.bindings.set(key, seatId); }
  deleteBinding(key: string): void { this.bindings.delete(key); }
  purge(): void {
    this.game = null;
    this.seats.clear(); this.members.clear(); this.tasks.clear(); this.boards.clear(); this.reclaims.clear(); this.bindings.clear();
    this.bingos = [];
  }
}

type Row = Record<string, SqlStorageValue>;

/** `Persistence` over a Durable Object's SQLite storage; JSON columns are TEXT. */
export class SqlPersistence implements Persistence {
  constructor(private sql: SqlStorage) {
    const ddl = [
      `CREATE TABLE IF NOT EXISTS game (id INTEGER PRIMARY KEY CHECK (id = 1), gameId TEXT NOT NULL, code TEXT NOT NULL, stage TEXT NOT NULL,
        hostSeatId TEXT NOT NULL, createdAt INTEGER NOT NULL, launchedAt INTEGER, endedAt INTEGER, bingoCount INTEGER NOT NULL,
        reviewGate INTEGER NOT NULL, freeSpace INTEGER NOT NULL DEFAULT 0, rev INTEGER NOT NULL, lastMutationAt INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS seats (seatId TEXT PRIMARY KEY, name TEXT NOT NULL, nameKey TEXT NOT NULL, joinedAt INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS members (uid TEXT PRIMARY KEY, seatId TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS tasks (taskId TEXT PRIMARY KEY, text TEXT NOT NULL, authorSeatId TEXT NOT NULL, mentions TEXT NOT NULL, createdAt INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS boards (seatId TEXT PRIMARY KEY, cells TEXT NOT NULL, marks TEXT NOT NULL, completedLines TEXT NOT NULL, announcedLines TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS bingos (id TEXT PRIMARY KEY, seq INTEGER NOT NULL, seatId TEXT NOT NULL, name TEXT NOT NULL, line TEXT NOT NULL,
        playerBingoNumber INTEGER NOT NULL, at INTEGER NOT NULL, status TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS reclaims (id TEXT PRIMARY KEY, requesterUid TEXT NOT NULL, name TEXT NOT NULL, seatId TEXT NOT NULL,
        status TEXT NOT NULL, createdAt INTEGER NOT NULL, resolvedAt INTEGER)`,
      `CREATE TABLE IF NOT EXISTS bindings (key TEXT PRIMARY KEY, seatId TEXT NOT NULL)`,
    ];
    for (const q of ddl) sql.exec(q);
    // Rooms created before the free-space option have a `game` table without the column; add it. A lobby room
    // starts off (the new default); a room already dealt was dealt with a free centre, so it keeps free space on.
    const cols = sql.exec<{ name: string }>('PRAGMA table_info(game)').toArray().map((c) => c.name);
    if (!cols.includes('freeSpace')) {
      sql.exec('ALTER TABLE game ADD COLUMN freeSpace INTEGER NOT NULL DEFAULT 0');
      sql.exec("UPDATE game SET freeSpace = 1 WHERE stage != 'lobby'");
    }
  }

  load(): Loaded {
    const all = (q: string): Row[] => this.sql.exec<Row>(q).toArray();
    const g = all('SELECT * FROM game')[0];
    return {
      game: g
        ? {
            gameId: g.gameId as string, code: g.code as string, stage: g.stage as GameRow['stage'], hostSeatId: g.hostSeatId as string,
            createdAt: g.createdAt as number, ...(g.launchedAt !== null && { launchedAt: g.launchedAt as number }),
            ...(g.endedAt !== null && { endedAt: g.endedAt as number }), bingoCount: g.bingoCount as number,
            reviewGate: g.reviewGate === 1, freeSpace: g.freeSpace === 1, rev: g.rev as number, lastMutationAt: g.lastMutationAt as number,
          }
        : null,
      seats: all('SELECT * FROM seats') as unknown as SeatRow[],
      members: all('SELECT * FROM members').map((m): [string, string] => [m.uid as string, m.seatId as string]),
      tasks: all('SELECT * FROM tasks').map((t) => ({ ...t, mentions: JSON.parse(t.mentions as string) }) as unknown as TaskRow),
      boards: all('SELECT * FROM boards').map((b) => ({
        seatId: b.seatId as string, cells: JSON.parse(b.cells as string), marks: JSON.parse(b.marks as string),
        completedLines: JSON.parse(b.completedLines as string), announcedLines: JSON.parse(b.announcedLines as string),
      })),
      bingos: all('SELECT * FROM bingos ORDER BY seq') as unknown as BingoRow[],
      reclaims: all('SELECT * FROM reclaims').map((r) => {
        const { resolvedAt, ...rest } = r;
        return (resolvedAt === null ? rest : { ...rest, resolvedAt }) as unknown as ReclaimRow;
      }),
      bindings: all('SELECT * FROM bindings').map((b): [string, string] => [b.key as string, b.seatId as string]),
    };
  }

  putGame(g: GameRow): void {
    this.sql.exec(
      `INSERT OR REPLACE INTO game (id, gameId, code, stage, hostSeatId, createdAt, launchedAt, endedAt, bingoCount, reviewGate, freeSpace, rev, lastMutationAt)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      g.gameId, g.code, g.stage, g.hostSeatId, g.createdAt, g.launchedAt ?? null, g.endedAt ?? null, g.bingoCount,
      g.reviewGate ? 1 : 0, g.freeSpace ? 1 : 0, g.rev, g.lastMutationAt,
    );
  }
  putSeat(s: SeatRow): void {
    this.sql.exec('INSERT OR REPLACE INTO seats (seatId, name, nameKey, joinedAt) VALUES (?, ?, ?, ?)', s.seatId, s.name, s.nameKey, s.joinedAt);
  }
  putMember(uid: string, seatId: string): void {
    this.sql.exec('INSERT OR REPLACE INTO members (uid, seatId) VALUES (?, ?)', uid, seatId);
  }
  deleteMember(uid: string): void { this.sql.exec('DELETE FROM members WHERE uid = ?', uid); }
  putTask(t: TaskRow): void {
    this.sql.exec(
      'INSERT OR REPLACE INTO tasks (taskId, text, authorSeatId, mentions, createdAt) VALUES (?, ?, ?, ?, ?)',
      t.taskId, t.text, t.authorSeatId, JSON.stringify(t.mentions), t.createdAt,
    );
  }
  deleteTask(taskId: string): void { this.sql.exec('DELETE FROM tasks WHERE taskId = ?', taskId); }
  putBoard(b: BoardRow): void {
    this.sql.exec(
      'INSERT OR REPLACE INTO boards (seatId, cells, marks, completedLines, announcedLines) VALUES (?, ?, ?, ?, ?)',
      b.seatId, JSON.stringify(b.cells), JSON.stringify(b.marks), JSON.stringify(b.completedLines), JSON.stringify(b.announcedLines),
    );
  }
  appendBingo(b: BingoRow): void {
    this.sql.exec(
      'INSERT OR REPLACE INTO bingos (id, seq, seatId, name, line, playerBingoNumber, at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      b.id, b.seq, b.seatId, b.name, b.line, b.playerBingoNumber, b.at, b.status,
    );
  }
  putReclaim(r: ReclaimRow): void {
    this.sql.exec(
      'INSERT OR REPLACE INTO reclaims (id, requesterUid, name, seatId, status, createdAt, resolvedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      r.id, r.requesterUid, r.name, r.seatId, r.status, r.createdAt, r.resolvedAt ?? null,
    );
  }
  putBinding(key: string, seatId: string): void {
    this.sql.exec('INSERT OR REPLACE INTO bindings (key, seatId) VALUES (?, ?)', key, seatId);
  }
  deleteBinding(key: string): void { this.sql.exec('DELETE FROM bindings WHERE key = ?', key); }
  purge(): void {
    for (const t of ['game', 'seats', 'members', 'tasks', 'boards', 'bingos', 'reclaims', 'bindings']) this.sql.exec(`DELETE FROM ${t}`);
  }
}
