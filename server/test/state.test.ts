import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { GameState, type BoardRow, type GameRow, type TaskRow } from '../src/room/state';
import { MemoryPersistence, SqlPersistence } from '../src/room/persistence';

const game = (over: Partial<GameRow> = {}): GameRow => ({
  gameId: 'g1', code: 'ABCD', stage: 'lobby', hostSeatId: 'A', createdAt: 1, bingoCount: 0, reviewGate: false, freeSpace: false, rev: 0, lastMutationAt: 0, ...over,
});
const task = (over: Partial<TaskRow> = {}): TaskRow => ({
  taskId: 't1', text: 'hello', authorSeatId: 'A', mentions: { seatIds: ['B'], someone: false, anyone: false }, createdAt: 5, ...over,
});
const board = (): BoardRow => ({
  seatId: 'A', cells: [{ taskId: 't1', text: 'x' } as never], marks: [true, false], completedLines: ['r0'], announcedLines: [],
});

describe('GameState', () => {
  it('putTask then reload returns the task with parsed mentions', () => {
    const p = new MemoryPersistence();
    const s = new GameState(p);
    s.putGame(game());
    s.putTask(task());
    const again = new GameState(p);
    expect(again.tasks.get('t1')?.mentions.seatIds).toEqual(['B']);
    expect(again.game?.code).toBe('ABCD');
  });

  it('putTask bumps rev once; putMember does not', () => {
    const s = new GameState(new MemoryPersistence());
    s.putGame(game());
    const r0 = s.game!.rev;
    s.putTask(task());
    expect(s.game!.rev).toBe(r0 + 1);
    s.putMember('u1', 'A');
    s.deleteMember('u1');
    expect(s.game!.rev).toBe(r0 + 1);
    expect(s.game!.lastMutationAt).toBeGreaterThan(0);
  });

  it('purge empties every table and game becomes null', () => {
    const p = new MemoryPersistence();
    const s = new GameState(p);
    s.putGame(game());
    s.putSeat({ seatId: 'A', name: 'Ann', nameKey: 'ann', joinedAt: 1 });
    s.putMember('u1', 'A');
    s.putTask(task());
    s.putBoard(board());
    s.appendBingo({ id: 'b1', seq: 1, seatId: 'A', name: 'Ann', line: 'r0', playerBingoNumber: 1, at: 1, status: 'announced' });
    s.putReclaim({ id: 'r1', requesterUid: 'u2', name: 'Ann', seatId: 'A', status: 'pending', createdAt: 1 });
    s.purge();
    for (const st of [s, new GameState(p)]) {
      expect(st.game).toBeNull();
      expect(st.seats.size + st.members.size + st.tasks.size + st.boards.size + st.bingos.length + st.reclaims.size).toBe(0);
    }
  });

  it('derived helpers', () => {
    const s = new GameState(new MemoryPersistence());
    s.putGame(game());
    s.putSeat({ seatId: 'A', name: 'Ann', nameKey: 'ann', joinedAt: 1 });
    s.putMember('u1', 'A');
    s.putTask(task());
    expect(s.seatOf('u1')).toBe('A');
    expect(s.seatOf('zz')).toBeNull();
    expect(s.isHost('u1')).toBe(true);
    expect(s.seatList()).toEqual([{ seatId: 'A', name: 'Ann', joinedAt: 1 }]);
    expect(s.poolTasks()[0].id).toBe('t1');
  });

  it('SqlPersistence round-trips a board', async () => {
    const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName('T2'));
    await runInDurableObject(stub, (_i, state) => {
      const p = new SqlPersistence(state.storage.sql);
      const s = new GameState(p);
      s.putGame(game());
      s.putSeat({ seatId: 'A', name: 'Ann', nameKey: 'ann', joinedAt: 1 });
      s.putMember('u1', 'A');
      s.putTask(task());
      s.putBoard(board());
      s.appendBingo({ id: 'b1', seq: 1, seatId: 'A', name: 'Ann', line: 'r0', playerBingoNumber: 1, at: 1, status: 'announced' });
      s.putReclaim({ id: 'r1', requesterUid: 'u2', name: 'Ann', seatId: 'A', status: 'pending', createdAt: 1 });
      const again = new GameState(new SqlPersistence(state.storage.sql));
      expect(again.boards.get('A')).toEqual(board());
      expect(again.tasks.get('t1')).toEqual(task());
      expect(again.members.get('u1')).toBe('A');
      expect(again.bingos).toHaveLength(1);
      expect(again.reclaims.get('r1')?.status).toBe('pending');
      expect(again.game?.rev).toBe(s.game!.rev);
      s.purge();
      expect(new GameState(new SqlPersistence(state.storage.sql)).game).toBeNull();
    });
  });

  it('SqlPersistence round-trips optionals, booleans and JSON columns exactly', async () => {
    const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName('T2b'));
    await runInDurableObject(stub, (_i, state) => {
      const s = new GameState(new SqlPersistence(state.storage.sql));
      s.putGame(game({ stage: 'ended', reviewGate: true, launchedAt: 7, endedAt: 9, bingoCount: 2 }));
      s.putBoard(board());
      const bingo = { id: 'b1', seq: 1, seatId: 'A', name: 'Ann', line: 'r0', playerBingoNumber: 1, at: 3, status: 'announced' as const };
      s.appendBingo(bingo);
      s.appendBingo(bingo); // duplicate id is an upsert, not a throw
      const denied = { id: 'r1', requesterUid: 'u2', name: 'Ann', seatId: 'A', status: 'denied' as const, createdAt: 1, resolvedAt: 4 };
      const pending = { id: 'r2', requesterUid: 'u3', name: 'Bo', seatId: 'B', status: 'pending' as const, createdAt: 2 };
      s.putReclaim(denied);
      s.putReclaim(pending);
      const again = new GameState(new SqlPersistence(state.storage.sql));
      expect(again.game).toEqual(s.game);
      expect(again.game?.reviewGate).toBe(true);
      expect(again.boards.get('A')).toEqual(board());
      expect(again.bingos).toEqual([bingo]);
      expect(s.bingos).toEqual([bingo]);
      expect(again.reclaims.get('r1')).toEqual(denied);
      expect(again.reclaims.get('r2')).toEqual(pending);
      expect('resolvedAt' in again.reclaims.get('r2')!).toBe(false);
      // absent optionals stay absent
      s.putGame(game());
      const plain = new GameState(new SqlPersistence(state.storage.sql)).game!;
      expect('launchedAt' in plain).toBe(false);
      expect('endedAt' in plain).toBe(false);
      expect(plain.reviewGate).toBe(false);
      expect(plain.freeSpace).toBe(false);
      s.putGame(game({ freeSpace: true }));
      expect(new GameState(new SqlPersistence(state.storage.sql)).game!.freeSpace).toBe(true);
    });
  });

  it('SqlPersistence adds freeSpace to a game table created before it existed', async () => {
    const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName('T2c'));
    await runInDurableObject(stub, (_i, state) => {
      const sql = state.storage.sql;
      // The pre-feature DDL, verbatim (the room's own constructor already made the new shape: replace it).
      sql.exec('DROP TABLE IF EXISTS game');
      sql.exec(`CREATE TABLE game (id INTEGER PRIMARY KEY CHECK (id = 1), gameId TEXT NOT NULL, code TEXT NOT NULL, stage TEXT NOT NULL,
        hostSeatId TEXT NOT NULL, createdAt INTEGER NOT NULL, launchedAt INTEGER, endedAt INTEGER, bingoCount INTEGER NOT NULL,
        reviewGate INTEGER NOT NULL, rev INTEGER NOT NULL, lastMutationAt INTEGER NOT NULL)`);
      sql.exec(`INSERT INTO game (id, gameId, code, stage, hostSeatId, createdAt, launchedAt, endedAt, bingoCount, reviewGate, rev, lastMutationAt)
        VALUES (1, 'old', 'OLDGM', 'playing', 'A', 1, 2, NULL, 0, 0, 7, 3)`);
      const p = new SqlPersistence(sql);
      const loaded = p.load().game!;
      expect(loaded).toMatchObject({ gameId: 'old', stage: 'playing', rev: 7, freeSpace: false });
      p.putGame({ ...loaded, freeSpace: true });
      expect(p.load().game!.freeSpace).toBe(true);
      // A second construction over the migrated table is a no-op.
      expect(new SqlPersistence(sql).load().game!.freeSpace).toBe(true);
    });
  });

  it('MemoryPersistence loads a game row without freeSpace as off', () => {
    const p = new MemoryPersistence();
    const { freeSpace: _f, ...legacy } = game();
    p.putGame(legacy as GameRow);
    expect(p.load().game!.freeSpace).toBe(false);
    expect(new GameState(p).game!.freeSpace).toBe(false);
  });
});
