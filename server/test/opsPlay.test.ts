import { describe, expect, it } from 'vitest';
import { AppError } from '../src/errors';
import { MemoryPersistence } from '../src/room/persistence';
import {
  OPS, addTask, adminSeats, adminTransferHost, claimGame, end, join, launch, mark, resolveReclaim, setOptions, transferHost, type OpCtx,
} from '../src/room/ops';
import { ALL_SECTIONS, buildSections } from '../src/room/sections';
import type { BoardRow } from '../src/room/state';
import { GameState } from '../src/room/state';

const NOW = 1_700_000_000_000;
const clock = NOW;
let counter = 0;
const ctxFor = (uid: string, now = clock): OpCtx => ({ uid, now, rng: () => 0.5, newId: () => `id${++counter}` });
const fresh = () => new GameState(new MemoryPersistence(), { now: () => clock });
const errOf = (fn: () => unknown): AppError => {
  try { fn(); } catch (e) { if (e instanceof AppError) return e; throw e; }
  throw new Error('did not throw');
};
const codeOf = (fn: () => unknown): string | undefined => {
  try { fn(); } catch (e) { if (e instanceof AppError) return e.code; throw e; }
  return undefined;
};

/** Host u1 (Stephen) + u2 (Cody) (+ u3 Seth) with 30 plain tasks; not yet launched. Free space on unless told otherwise. */
function lobby(withThird = false, freeSpace = true) {
  const state = fresh();
  const g = claimGame(state, ctxFor('u1'), { gameId: 'g1', code: 'ABCDE', name: 'Stephen' }).result;
  if (freeSpace) setOptions(state, ctxFor('u1'), { freeSpace: true });
  const c = join(state, ctxFor('u2'), { name: 'Cody' }).result as { seatId: string };
  const ids: Record<string, string> = { u1: g.seatId, u2: c.seatId };
  if (withThird) ids.u3 = (join(state, ctxFor('u3'), { name: 'Seth' }).result as { seatId: string }).seatId;
  for (let i = 0; i < 30; i++) addTask(state, ctxFor('u1'), { taskId: `t${i}`, text: `plain ${i}` });
  return { state, ids, code: g.code };
}
function playing(withThird = false, freeSpace = true) {
  const l = lobby(withThird, freeSpace);
  launch(l.state, ctxFor('u1'), {});
  return l;
}
const doMark = (state: GameState, uid: string, cellIndex: number, marked?: boolean) =>
  mark(state, ctxFor(uid), marked === undefined ? { cellIndex } : { cellIndex, marked });
const bingos = (state: GameState) => [...state.bingos].sort((a, b) => a.seq - b.seq);
const markedCount = (state: GameState, seat: string) => state.boards.get(seat)!.marks.filter(Boolean).length;

/** Host u1, u2 (Cody), 30 tasks (launched unless told otherwise); u9 asks to reclaim Cody's seat by typing "cody". */
function withReclaim(launched = true) {
  const l = launched ? playing() : lobby();
  const j = join(l.state, ctxFor('u9'), { name: 'cody' }).result as { status: string; reclaimId: string };
  expect(j.status).toBe('reclaim-pending');
  return { ...l, hostSeat: l.ids.u1, codySeat: l.ids.u2, reclaimId: j.reclaimId };
}

describe('launch', () => {
  it('rejects non-host', () => {
    const { state } = lobby();
    expect(codeOf(() => launch(state, ctxFor('u2'), {}))).toBe('not-host');
  });
  it('rejects with not-ready carrying recomputed shortfalls', () => {
    const state = fresh();
    const g = claimGame(state, ctxFor('u1'), { gameId: 'g1', code: 'ABCDE', name: 'Stephen' }).result;
    const c = join(state, ctxFor('u2'), { name: 'Cody' }).result as { seatId: string };
    const e = errOf(() => launch(state, ctxFor('u1'), {}));
    expect(e.code).toBe('not-ready');
    expect(e.details).toEqual({ shortfalls: { [g.seatId]: 25, [c.seatId]: 25 } });
  });
  it('deals every seat a board and enters playing', () => {
    const { state, ids } = lobby(true);
    const out = launch(state, ctxFor('u1', NOW + 5), {});
    expect(state.game!.stage).toBe('playing');
    expect(state.game!.launchedAt).toBe(NOW + 5);
    expect(buildSections(state, ids.u1, ['game']).game!.shortfalls).toEqual({});
    for (const seat of Object.values(ids)) {
      const b = state.boards.get(seat)!;
      expect(b.cells).toHaveLength(25);
      expect(b.cells[12]).toEqual({ kind: 'free' });
      expect(b.marks).toHaveLength(25);
      expect(b.marks[12]).toBe(true);
      expect(markedCount(state, seat)).toBe(1);
      expect(b.completedLines).toEqual([]);
      expect(b.announcedLines).toEqual([]);
    }
    expect(out.push.all).toEqual(['game', 'standings']);
    expect(out.push.perSeat).toEqual({ [ids.u1]: ['board'], [ids.u2]: ['board'], [ids.u3]: ['board'] });
  });
  it('rejects a second launch and addTask after launch', () => {
    const { state } = playing();
    expect(codeOf(() => launch(state, ctxFor('u1'), {}))).toBe('wrong-stage');
    expect(codeOf(() => addTask(state, ctxFor('u2'), { taskId: 'late', text: 'late' }))).toBe('wrong-stage');
  });
});

describe('mark', () => {
  it('row completion appends one announced bingo', () => {
    const { state, ids } = playing();
    for (const i of [0, 1, 2, 3]) doMark(state, 'u2', i);
    const out = doMark(state, 'u2', 4);
    expect(out.result.newBingoSeqs).toEqual([1]);
    expect(out.result.completedLines).toEqual(['row_0']);
    const [b] = bingos(state);
    expect(b).toMatchObject({ seq: 1, seatId: ids.u2, name: 'Cody', line: 'row_0', playerBingoNumber: 1, status: 'announced', at: NOW });
    expect(state.game!.bingoCount).toBe(1);
    expect(state.boards.get(ids.u2)!.announcedLines).toEqual(['row_0']);
    expect(out.push.all).toEqual(['bingos', 'game', 'standings']);
    expect(out.push.perSeat).toEqual({ [ids.u2]: ['board'] });
    expect(buildSections(state, ids.u1, ['bingos']).bingos).toHaveLength(1);
  });
  it('a plain mark pushes the caller\'s board and standings to all', () => {
    const { state, ids } = playing();
    const out = doMark(state, 'u2', 3);
    expect(out.push).toEqual({ all: ['standings'], perSeat: { [ids.u2]: ['board'] } });
  });
  it('unmark and re-mark does not re-announce', () => {
    const { state } = playing();
    for (const i of [0, 1, 2, 3, 4]) doMark(state, 'u2', i);
    doMark(state, 'u2', 4);
    const res = doMark(state, 'u2', 4).result;
    expect(res.newBingoSeqs).toEqual([]);
    expect(bingos(state)).toHaveLength(1);
    expect(state.game!.bingoCount).toBe(1);
  });
  it('unmarking a completed line keeps its bingo and announced line', () => {
    const { state, ids } = playing();
    for (const i of [0, 1, 2, 3, 4]) doMark(state, 'u2', i);
    doMark(state, 'u2', 4);
    expect(bingos(state)).toHaveLength(1);
    expect(state.boards.get(ids.u2)!.announcedLines).toEqual(['row_0']);
  });
  it('second line gets seq 2 and playerBingoNumber 2', () => {
    const { state } = playing();
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8]) doMark(state, 'u2', i);
    doMark(state, 'u2', 9);
    expect(bingos(state).map((b) => [b.seq, b.line, b.playerBingoNumber])).toEqual([[1, 'row_0', 1], [2, 'row_1', 2]]);
  });
  it('one mark completing two lines writes consecutive seqs', () => {
    const { state } = playing();
    for (const i of [1, 2, 3, 4, 5, 10, 15, 20]) doMark(state, 'u2', i);
    const res = doMark(state, 'u2', 0).result;
    expect(res.newBingoSeqs).toEqual([1, 2]);
    const bs = bingos(state);
    expect(bs.map((b) => [b.seq, b.playerBingoNumber])).toEqual([[1, 1], [2, 2]]);
    expect(new Set(bs.map((b) => b.line))).toEqual(new Set(['row_0', 'col_0']));
  });
  it('bingos from two players get seqs exactly {1,2}', () => {
    const { state } = playing();
    for (const u of ['u1', 'u2']) for (const i of [0, 1, 2, 3]) doMark(state, u, i);
    const a = doMark(state, 'u1', 4).result;
    const b = doMark(state, 'u2', 4).result;
    expect([...a.newBingoSeqs, ...b.newBingoSeqs].sort()).toEqual([1, 2]);
    expect(bingos(state).map((x) => x.seq)).toEqual([1, 2]);
    expect(state.game!.bingoCount).toBe(2);
  });
  it('marked=true sent twice marks once and announces at most one bingo', () => {
    const { state, ids } = playing();
    for (const i of [0, 1, 2, 3]) doMark(state, 'u2', i, true);
    const first = doMark(state, 'u2', 4, true);
    const retry = doMark(state, 'u2', 4, true);
    expect(first.result.newBingoSeqs).toEqual([1]);
    expect(retry.result.newBingoSeqs).toEqual([]);
    expect(retry.result.marks[4]).toBe(true);
    expect(retry.push).toEqual({ all: [] });
    expect(bingos(state)).toHaveLength(1);
    expect(state.game!.bingoCount).toBe(1);
    expect(state.boards.get(ids.u2)!.marks[4]).toBe(true);
  });
  it('marked=false on an unmarked square is a no-op', () => {
    const { state, ids } = playing();
    const rev = state.game!.rev;
    const out = doMark(state, 'u2', 3, false);
    expect(out.result.marks[3]).toBe(false);
    expect(out.push).toEqual({ all: [] });
    expect(state.game!.rev).toBe(rev);
    expect(markedCount(state, ids.u2)).toBe(1);
  });
  it('marked omitted flips (0.1.0 clients)', () => {
    const { state, ids } = playing();
    doMark(state, 'u2', 3);
    expect(state.boards.get(ids.u2)!.marks[3]).toBe(true);
    doMark(state, 'u2', 3);
    expect(state.boards.get(ids.u2)!.marks[3]).toBe(false);
  });
  it('rejects a non-boolean marked', () => {
    const { state } = playing();
    expect(codeOf(() => mark(state, ctxFor('u2'), { cellIndex: 3, marked: 'yes' as unknown as boolean }))).toBe('invalid-cell');
  });
  it('validates cellIndex', () => {
    const { state, ids } = playing();
    for (const cellIndex of [25, -1, 1.5, '3', null, undefined]) {
      expect(codeOf(() => mark(state, ctxFor('u2'), { cellIndex: cellIndex as unknown as number }))).toBe('invalid-cell');
    }
    doMark(state, 'u2', 12);
    expect(markedCount(state, ids.u2)).toBe(1);
  });
  it('rejects marks in lobby and after end', () => {
    const { state } = lobby();
    expect(codeOf(() => doMark(state, 'u2', 0))).toBe('wrong-stage');
    launch(state, ctxFor('u1'), {});
    end(state, ctxFor('u1'), {});
    expect(codeOf(() => doMark(state, 'u2', 0))).toBe('wrong-stage');
  });
  it('rejects non-members', () => {
    const { state } = playing();
    expect(codeOf(() => doMark(state, 'u9', 0))).toBe('permission-denied');
  });
});

/** A seeded linear-congruential rng in [0, 1). */
const seeded = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const taskIdsOf = (b: BoardRow): string[] => b.cells.flatMap((c) => (c.kind === 'task' ? [c.taskId] : []));

describe('free space', () => {
  it('launch with free space off deals 25 task cells and leaves the centre unmarked', () => {
    const { state, ids } = playing(true, false);
    for (const seat of Object.values(ids)) {
      const b = state.boards.get(seat)!;
      expect(b.cells.filter((c) => c.kind === 'task')).toHaveLength(25);
      expect(b.marks[12]).toBe(false);
      expect(markedCount(state, seat)).toBe(0);
    }
  });
  it('launch with free space on keeps the free, pre-marked centre', () => {
    const { state, ids } = playing(true, true);
    for (const seat of Object.values(ids)) {
      const b = state.boards.get(seat)!;
      expect(b.cells.filter((c) => c.kind === 'task')).toHaveLength(24);
      expect(b.cells[12]).toEqual({ kind: 'free' });
      expect(b.marks[12]).toBe(true);
    }
  });
  it('without free space a mark on 12 marks it, counts toward lines and pushes standings to all', () => {
    const { state, ids } = playing(false, false);
    const out = doMark(state, 'u2', 12);
    expect(state.boards.get(ids.u2)!.marks[12]).toBe(true);
    expect(out.push).toEqual({ all: ['standings'], perSeat: { [ids.u2]: ['board'] } });
    expect(buildSections(state, ids.u2, ['standings']).standings!.find((x) => x.seatId === ids.u2)!.marked).toBe(1);
    for (const i of [10, 11, 13]) doMark(state, 'u2', i);
    expect(doMark(state, 'u2', 14).result.newBingoSeqs).toEqual([1]);
    expect(state.boards.get(ids.u2)!.announcedLines).toEqual(['row_2']);
    doMark(state, 'u2', 12);
    expect(state.boards.get(ids.u2)!.marks[12]).toBe(false);
  });
});

describe('@anyone at launch', () => {
  it('two @anyone tasks across three seats each land on at most one board', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { state, ids } = lobby(true, true);
      addTask(state, ctxFor('u2'), { taskId: 'any1', text: '@anyone dances' });
      addTask(state, ctxFor('u3'), { taskId: 'any2', text: '@anyone sings' });
      launch(state, { ...ctxFor('u1'), rng: seeded(seed) }, {});
      for (const id of ['any1', 'any2']) {
        const holders = Object.values(ids).filter((seat) => taskIdsOf(state.boards.get(seat)!).includes(id));
        expect(holders.length).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('join while playing', () => {
  /** Host alone with `n` plain tasks (plus whatever `extra` seeds), free space off, launched. */
  function soloLaunched(n: number, extra?: (state: GameState) => void) {
    const state = fresh();
    const g = claimGame(state, ctxFor('u1'), { gameId: 'g1', code: 'ABCDE', name: 'Stephen' }).result;
    for (let i = 0; i < n; i++) addTask(state, ctxFor('u1'), { taskId: `t${i}`, text: `plain ${i}` });
    extra?.(state);
    launch(state, ctxFor('u1'), {});
    return { state, host: g.seatId };
  }
  const plain = (state: GameState, id: string) =>
    state.putTask({ taskId: id, text: `plain ${id}`, authorSeatId: 'x', mentions: { seatIds: [], someone: false, anyone: false }, createdAt: 99 });
  const anyone = (state: GameState, id: string) =>
    state.putTask({ taskId: id, text: `@anyone ${id}`, authorSeatId: 'x', mentions: { seatIds: [], someone: false, anyone: true }, createdAt: 99 });
  const joinWith = (state: GameState, rng: () => number) =>
    taskIdsOf(state.boards.get((join(state, { ...ctxFor(`late${++counter}`), rng }, { name: `Late ${counter}` }).result as { seatId: string }).seatId)!);

  it('a late joiner shares plain tasks with existing boards', () => {
    // Exactly 25 plain tasks, all already on the host's board: the joiner still gets a board of the same 25.
    const { state, host } = soloLaunched(25);
    const out = join(state, ctxFor('u2'), { name: 'Cody' });
    const seat = (out.result as { seatId: string }).seatId;
    const mine = taskIdsOf(state.boards.get(seat)!);
    expect(new Set(mine)).toEqual(new Set(taskIdsOf(state.boards.get(host)!)));
    expect(state.boards.get(seat)!.marks.filter(Boolean)).toHaveLength(0);
    expect(out.push.all).toContain('standings');
  });
  it('an @anyone task already on a board never reaches a late joiner', () => {
    // 24 plain + one @anyone: the host (25 needed) must hold the @anyone task.
    const { state, host } = soloLaunched(24, (s) => anyone(s, 'any1'));
    expect(taskIdsOf(state.boards.get(host)!)).toContain('any1');
    // Without one more plain task the joiner has only 24 eligible.
    expect(codeOf(() => join(state, ctxFor('u2'), { name: 'Cody' }))).toBe('not-ready');
    plain(state, 'extra');
    for (let seed = 1; seed <= 20; seed++) expect(joinWith(state, seeded(seed))).not.toContain('any1');
  });
  it('an @anyone task on no board may reach a late joiner', () => {
    const { state } = soloLaunched(25);
    anyone(state, 'any2');
    const dealt = Array.from({ length: 20 }, (_, i) => joinWith(state, seeded(i + 1)).includes('any2'));
    expect(dealt).toContain(true);
  });
});

describe('standings section', () => {
  it('ranks by bingos, carries marks, best line and first bingo seq', () => {
    const { state, ids } = playing();
    expect(buildSections(state, ids.u1, ['standings']).standings!.map((x) => x.bingos)).toEqual([0, 0]);
    for (const i of [0, 1, 2, 3, 4]) doMark(state, 'u2', i);
    doMark(state, 'u1', 0);
    doMark(state, 'u1', 6);
    const rows = buildSections(state, ids.u1, ['standings']).standings!;
    expect(rows).toEqual([
      { seatId: ids.u2, name: 'Cody', bingos: 1, marked: 5, bestLine: 2, firstBingoSeq: 1 },
      { seatId: ids.u1, name: 'Stephen', bingos: 0, marked: 2, bestLine: 3, firstBingoSeq: null },
    ]);
  });
  it('is empty in the lobby', () => {
    const { state, ids } = lobby();
    expect(buildSections(state, ids.u1, ['standings']).standings).toEqual([]);
  });
});

describe('end', () => {
  it('rejects non-host, ends for host while playing, rejects an ended game', () => {
    const { state } = playing();
    expect(codeOf(() => end(state, ctxFor('u2'), {}))).toBe('not-host');
    const out = end(state, ctxFor('u1', NOW + 9), {});
    expect(state.game!.stage).toBe('ended');
    expect(state.game!.endedAt).toBe(NOW + 9);
    expect(out.push.all).toEqual(['game', 'standings']);
    expect(codeOf(() => end(state, ctxFor('u1'), {}))).toBe('wrong-stage');
  });
  it('ends from the lobby: no boards, no bingos, launch refused afterwards', () => {
    const { state, ids } = lobby();
    expect(codeOf(() => end(state, ctxFor('u2'), {}))).toBe('not-host');
    const out = end(state, ctxFor('u1', NOW + 5), {});
    expect(state.game).toMatchObject({ stage: 'ended', endedAt: NOW + 5, bingoCount: 0 });
    expect(out.push.all).toEqual(['game', 'standings']);
    expect(state.boards.size).toBe(0);
    expect(bingos(state)).toEqual([]);
    expect(codeOf(() => end(state, ctxFor('u1'), {}))).toBe('wrong-stage');
    expect(codeOf(() => launch(state, ctxFor('u1'), {}))).toBe('wrong-stage');
    const sections = buildSections(state, ids.u2, ALL_SECTIONS);
    expect(sections.game).toMatchObject({ stage: 'ended' });
    expect(sections.board ?? null).toBeNull();
    expect(sections.bingos).toEqual([]);
  });
});

describe('resolveReclaim', () => {
  it('rejects non-host', () => {
    const { state, reclaimId } = withReclaim();
    expect(codeOf(() => resolveReclaim(state, ctxFor('u2'), { reclaimId, approve: true }))).toBe('not-host');
  });
  it('approve moves the seat to the requester and swaps board access', () => {
    const { state, codySeat, hostSeat, reclaimId } = withReclaim();
    const out = resolveReclaim(state, ctxFor('u1'), { reclaimId, approve: true });
    expect(state.seatOf('u9')).toBe(codySeat);
    expect(state.seatOf('u2')).toBeNull();
    expect(state.reclaims.get(reclaimId)!.status).toBe('approved');
    expect(out.push.evictUids).toEqual(['u2']);
    expect(out.push.perSeat).toEqual({ [hostSeat]: ['reclaims'], [codySeat]: ALL_SECTIONS });
    expect(buildSections(state, state.seatOf('u9'), ['board']).board).not.toBeNull();
    expect(buildSections(state, state.seatOf('u2'), ['board']).board).toBeNull();
  });
  it('deny marks denied without touching members', () => {
    const { state, codySeat, reclaimId } = withReclaim();
    const out = resolveReclaim(state, ctxFor('u1'), { reclaimId, approve: false });
    expect(state.reclaims.get(reclaimId)!.status).toBe('denied');
    expect(state.seatOf('u2')).toBe(codySeat);
    expect(state.seatOf('u9')).toBeNull();
    expect(out.push.reclaimNotify).toEqual([{ uid: 'u9', id: reclaimId, status: 'denied' }]);
  });
  it('a denied requester must wait a minute before asking for that seat again', () => {
    const { state, reclaimId } = withReclaim();
    resolveReclaim(state, ctxFor('u1'), { reclaimId, approve: false });
    expect(state.reclaims.get(reclaimId)!.resolvedAt).toBe(NOW);
    expect(codeOf(() => join(state, ctxFor('u9'), { name: 'Cody' }))).toBe('reclaim-cooldown');
    // Someone else may still ask.
    expect((join(state, ctxFor('u10'), { name: 'Cody' }).result as { status: string }).status).toBe('reclaim-pending');
    // After the minute, u9 may ask again.
    const again = join(state, ctxFor('u9', NOW + 61_000), { name: 'Cody' }).result as { status: string; reclaimId: string };
    expect(again.status).toBe('reclaim-pending');
    expect(again.reclaimId).not.toBe(reclaimId);
  });
  it('rejects an already-resolved reclaim', () => {
    const { state, reclaimId } = withReclaim();
    resolveReclaim(state, ctxFor('u1'), { reclaimId, approve: false });
    expect(codeOf(() => resolveReclaim(state, ctxFor('u1'), { reclaimId, approve: true }))).toBe('wrong-stage');
  });
  it('validates input', () => {
    const { state, reclaimId } = withReclaim();
    expect(codeOf(() => resolveReclaim(state, ctxFor('u1'), { reclaimId: 'nope', approve: true }))).toBe('reclaim-not-found');
    expect(codeOf(() => resolveReclaim(state, ctxFor('u1'), { reclaimId: 'a/b', approve: true }))).toBe('reclaim-not-found');
    expect(codeOf(() => resolveReclaim(state, ctxFor('u1'), { reclaimId, approve: 'yes' as unknown as boolean }))).toBe('invalid-argument');
  });
  it('works in the lobby too', () => {
    const { state, codySeat, reclaimId } = withReclaim(false);
    resolveReclaim(state, ctxFor('u1'), { reclaimId, approve: true });
    expect(state.seatOf('u9')).toBe(codySeat);
  });
  it('rejects approval when the requester already holds a seat, and denies the request', () => {
    const { state, codySeat, reclaimId } = withReclaim();
    state.putMember('u9', 'other');
    expect(codeOf(() => resolveReclaim(state, ctxFor('u1'), { reclaimId, approve: true }))).toBe('wrong-stage');
    expect(state.reclaims.get(reclaimId)!.status).toBe('denied');
    expect(state.seatOf('u2')).toBe(codySeat);
    expect(state.seatOf('u9')).toBe('other');
  });
  it('reclaiming the host seat after transfer keeps hostSeatId', () => {
    const { state, ids } = lobby();
    transferHost(state, ctxFor('u1'), { toSeatId: ids.u2 });
    const j = join(state, ctxFor('u9'), { name: 'stephen' }).result as { reclaimId: string };
    resolveReclaim(state, ctxFor('u2'), { reclaimId: j.reclaimId, approve: true });
    expect(state.seatOf('u9')).toBe(ids.u1);
    expect(state.game!.hostSeatId).toBe(ids.u2);
    expect(state.seatOf('u1')).toBeNull();
  });
  it('approving one of two competing reclaims denies the other', () => {
    const { state, codySeat, reclaimId } = withReclaim();
    const j10 = join(state, ctxFor('u10'), { name: 'cody' }).result as { reclaimId: string };
    const out = resolveReclaim(state, ctxFor('u1'), { reclaimId, approve: true });
    expect(state.reclaims.get(j10.reclaimId)!.status).toBe('denied');
    expect(out.push.reclaimNotify).toEqual(expect.arrayContaining([
      { uid: 'u9', id: reclaimId, status: 'approved' }, { uid: 'u10', id: j10.reclaimId, status: 'denied' },
    ]));
    expect(codeOf(() => resolveReclaim(state, ctxFor('u1'), { reclaimId: j10.reclaimId, approve: true }))).toBe('wrong-stage');
    expect(state.seatOf('u9')).toBe(codySeat);
    expect(state.seatOf('u10')).toBeNull();
  });
  it('approving a claim on the caller\'s own seat is refused and denied; deny still works', () => {
    const state = fresh();
    const g = claimGame(state, ctxFor('u1'), { gameId: 'g1', code: 'ABCDE', name: 'Stephen' }).result;
    const j = join(state, ctxFor('u9'), { name: 'stephen' }).result as { reclaimId: string };
    expect(codeOf(() => resolveReclaim(state, ctxFor('u1'), { reclaimId: j.reclaimId, approve: true }))).toBe('wrong-stage');
    expect(state.reclaims.get(j.reclaimId)!.status).toBe('denied');
    expect(state.seatOf('u1')).toBe(g.seatId);
    const j2 = join(state, ctxFor('u10'), { name: 'stephen' }).result as { reclaimId: string };
    resolveReclaim(state, ctxFor('u1'), { reclaimId: j2.reclaimId, approve: false });
    expect(state.reclaims.get(j2.reclaimId)!.status).toBe('denied');
  });
  it('a conflicting approve throws wrong-stage carrying the requester\'s denial push', () => {
    const { state, hostSeat, reclaimId } = withReclaim();
    state.putMember('u9', 'other');
    const e = errOf(() => resolveReclaim(state, ctxFor('u1'), { reclaimId, approve: true }));
    expect(e.code).toBe('wrong-stage');
    expect(e.push?.reclaimNotify).toContainEqual({ uid: 'u9', id: reclaimId, status: 'denied' });
    expect(e.push?.perSeat).toEqual({ [hostSeat]: ['reclaims'] });
    expect(state.reclaims.get(reclaimId)!.status).toBe('denied');
  });
  it('approve evicts every uid holding the seat', () => {
    const { state, codySeat, reclaimId } = withReclaim();
    state.putMember('u2b', codySeat);
    const out = resolveReclaim(state, ctxFor('u1'), { reclaimId, approve: true });
    expect([...out.push.evictUids!].sort()).toEqual(['u2', 'u2b']);
    expect(state.seatOf('u2')).toBeNull();
    expect(state.seatOf('u2b')).toBeNull();
    expect(state.seatOf('u9')).toBe(codySeat);
  });
});

describe('transferHost', () => {
  it('rejects non-host', () => {
    const { state, ids } = lobby();
    expect(codeOf(() => transferHost(state, ctxFor('u2'), { toSeatId: ids.u2 }))).toBe('not-host');
  });
  it('hands the host role over and strips the old host', () => {
    const { state, codySeat } = withReclaim(false);
    transferHost(state, ctxFor('u1'), { toSeatId: codySeat });
    expect(state.game!.hostSeatId).toBe(codySeat);
    expect(codeOf(() => launch(state, ctxFor('u1'), {}))).toBe('not-host');
    launch(state, ctxFor('u2'), {});
    expect(state.game!.stage).toBe('playing');
  });
  it('rejects an unknown or malformed seat', () => {
    const { state } = withReclaim(false);
    for (const toSeatId of ['ghost', 'a/b', 5]) {
      expect(codeOf(() => transferHost(state, ctxFor('u1'), { toSeatId: toSeatId as string }))).toBe('unknown-seat');
    }
  });
  it('transferHost to self is allowed', () => {
    const { state, ids } = lobby();
    transferHost(state, ctxFor('u1'), { toSeatId: ids.u1 });
    expect(state.game!.hostSeatId).toBe(ids.u1);
  });
  it('transferHost moves the reclaims section: push names old and new host', () => {
    const { state, ids } = lobby();
    const out = transferHost(state, ctxFor('u1'), { toSeatId: ids.u2 });
    expect(out.push.all).toEqual(['game']);
    expect(out.push.perSeat).toEqual({ [ids.u1]: ['reclaims'], [ids.u2]: ['reclaims'] });
    expect(buildSections(state, ids.u1, ['reclaims']).reclaims).toEqual([]);
  });
});

describe('admin', () => {
  it('adminTransferHost ignores who the caller is', () => {
    const { state, ids } = lobby();
    const out = adminTransferHost(state, { now: NOW }, { seatId: ids.u2 });
    expect(state.game!.hostSeatId).toBe(ids.u2);
    expect(out.push.perSeat).toEqual({ [ids.u1]: ['reclaims'], [ids.u2]: ['reclaims'] });
    expect(codeOf(() => adminTransferHost(state, { now: NOW }, { seatId: 'ghost' }))).toBe('unknown-seat');
  });
  it('adminSeats lists occupancy and the host', () => {
    const { state, ids } = lobby();
    state.deleteMember('u2');
    const rows = adminSeats(state);
    expect(rows.find((r) => r.seatId === ids.u1)).toEqual({ seatId: ids.u1, name: 'Stephen', occupied: true, host: true });
    expect(rows.find((r) => r.seatId === ids.u2)).toEqual({ seatId: ids.u2, name: 'Cody', occupied: false, host: false });
  });
});

describe('OPS', () => {
  it('maps every protocol op to its handler', () => {
    expect(Object.keys(OPS).sort()).toEqual(['addTask', 'deleteTask', 'end', 'join', 'launch', 'mark', 'resolveReclaim', 'setOptions', 'transferHost']);
  });
});
