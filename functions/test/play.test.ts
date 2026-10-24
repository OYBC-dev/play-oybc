import { beforeEach, describe, expect, it } from 'vitest';
import { admin, appCodeOf, callAs, clearFirestore, readAdmin } from './helpers';

beforeEach(clearFirestore);

/** Host u1 + u2 (+ u3) with a pool of 30 plain tasks; not yet launched. */
async function lobby(withThird = false) {
  const g = await callAs('u1', 'createGame', { name: 'Stephen' });
  const c = await callAs('u2', 'joinGame', { code: g.code, name: 'Cody' });
  const ids: Record<string, string> = { u1: g.seatId, u2: c.seatId };
  if (withThird) ids.u3 = (await callAs('u3', 'joinGame', { code: g.code, name: 'Seth' })).seatId;
  const gameId = g.gameId as string;
  for (let i = 0; i < 30; i++) await callAs('u1', 'addTask', { gameId, text: `plain ${i}` });
  return { gameId, ids };
}
async function playing(withThird = false) {
  const l = await lobby(withThird);
  await callAs('u1', 'launchGame', { gameId: l.gameId });
  return l;
}
const mark = (user: string, gameId: string, cellIndex: number) => callAs(user, 'toggleMark', { gameId, cellIndex });
const bingos = async (gameId: string) =>
  (await admin.collection(`games/${gameId}/bingos`).get()).docs.map((d) => d.data()).sort((a, b) => a.seq - b.seq);

describe('launchGame', () => {
  it('rejects non-host', async () => {
    const { gameId } = await lobby();
    expect(await appCodeOf(callAs('u2', 'launchGame', { gameId }))).toBe('not-host');
  });
  it('rejects with not-ready carrying recomputed shortfalls', async () => {
    const g = await callAs('u1', 'createGame', { name: 'Stephen' });
    const c = await callAs('u2', 'joinGame', { code: g.code, name: 'Cody' });
    try {
      await callAs('u1', 'launchGame', { gameId: g.gameId });
      throw new Error('expected failure');
    } catch (e: any) {
      expect(e.details.code).toBe('not-ready');
      expect(e.details.shortfalls).toEqual({ [g.seatId]: 24, [c.seatId]: 24 });
    }
  });
  it('deals every seat a board and enters playing', async () => {
    const { gameId, ids } = await lobby(true);
    await callAs('u1', 'launchGame', { gameId });
    const game = await readAdmin(`games/${gameId}`);
    expect(game.stage).toBe('playing');
    expect(typeof game.launchedAt).toBe('number');
    expect(game.shortfalls).toEqual({});
    for (const seat of Object.values(ids)) {
      const b = await readAdmin(`games/${gameId}/boards/${seat}`);
      expect(b.cells).toHaveLength(25);
      expect(b.cells[12]).toEqual({ kind: 'free' });
      expect(b.marks).toHaveLength(25);
      expect(b.marks[12]).toBe(true);
      expect(b.marks.filter(Boolean)).toHaveLength(1);
      expect(b.completedLines).toEqual([]);
      expect(b.announcedLines).toEqual([]);
    }
  });
  it('rejects a second launch and addTask after launch', async () => {
    const { gameId } = await playing();
    expect(await appCodeOf(callAs('u1', 'launchGame', { gameId }))).toBe('wrong-stage');
    expect(await appCodeOf(callAs('u2', 'addTask', { gameId, text: 'late' }))).toBe('wrong-stage');
  });
});

describe('toggleMark', () => {
  it('row completion appends one announced bingo', async () => {
    const { gameId, ids } = await playing();
    for (const i of [0, 1, 2, 3]) await mark('u2', gameId, i);
    const res = await mark('u2', gameId, 4);
    expect(res.newBingoSeqs).toEqual([1]);
    expect(res.completedLines).toEqual(['row_0']);
    const [b] = await bingos(gameId);
    expect(b).toMatchObject({ seq: 1, seatId: ids.u2, name: 'Cody', line: 'row_0', playerBingoNumber: 1, status: 'announced' });
    expect((await readAdmin(`games/${gameId}`)).bingoCount).toBe(1);
    expect((await readAdmin(`games/${gameId}/boards/${ids.u2}`)).announcedLines).toEqual(['row_0']);
  });
  it('unmark and re-mark does not re-announce', async () => {
    const { gameId } = await playing();
    for (const i of [0, 1, 2, 3, 4]) await mark('u2', gameId, i);
    await mark('u2', gameId, 4);
    const res = await mark('u2', gameId, 4);
    expect(res.newBingoSeqs).toEqual([]);
    expect(await bingos(gameId)).toHaveLength(1);
    expect((await readAdmin(`games/${gameId}`)).bingoCount).toBe(1);
  });
  it('second line gets seq 2 and playerBingoNumber 2', async () => {
    const { gameId } = await playing();
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8]) await mark('u2', gameId, i);
    await mark('u2', gameId, 9);
    const bs = await bingos(gameId);
    expect(bs.map((b) => [b.seq, b.line, b.playerBingoNumber])).toEqual([[1, 'row_0', 1], [2, 'row_1', 2]]);
  });
  it('one mark completing two lines writes consecutive seqs', async () => {
    const { gameId } = await playing();
    for (const i of [1, 2, 3, 4, 5, 10, 15, 20]) await mark('u2', gameId, i);
    const res = await mark('u2', gameId, 0);
    expect(res.newBingoSeqs).toEqual([1, 2]);
    const bs = await bingos(gameId);
    expect(bs.map((b) => [b.seq, b.playerBingoNumber])).toEqual([[1, 1], [2, 2]]);
    expect(new Set(bs.map((b) => b.line))).toEqual(new Set(['row_0', 'col_0']));
  });
  it('concurrent bingos from two players get seqs exactly {1,2}', async () => {
    const { gameId } = await playing();
    for (const u of ['u1', 'u2']) for (const i of [0, 1, 2, 3]) await mark(u, gameId, i);
    const [a, b] = await Promise.all([mark('u1', gameId, 4), mark('u2', gameId, 4)]);
    expect([...a.newBingoSeqs, ...b.newBingoSeqs].sort()).toEqual([1, 2]);
    expect((await bingos(gameId)).map((x) => x.seq)).toEqual([1, 2]);
    expect((await readAdmin(`games/${gameId}`)).bingoCount).toBe(2);
  });
  it('marked=true sent twice marks once and announces at most one bingo', async () => {
    const { gameId, ids } = await playing();
    for (const i of [0, 1, 2, 3]) await callAs('u2', 'toggleMark', { gameId, cellIndex: i, marked: true });
    const first = await callAs('u2', 'toggleMark', { gameId, cellIndex: 4, marked: true });
    const retry = await callAs('u2', 'toggleMark', { gameId, cellIndex: 4, marked: true });
    expect(first.newBingoSeqs).toEqual([1]);
    expect(retry.newBingoSeqs).toEqual([]);
    expect(retry.marks[4]).toBe(true);
    expect(await bingos(gameId)).toHaveLength(1);
    expect((await readAdmin(`games/${gameId}`)).bingoCount).toBe(1);
    expect((await readAdmin(`games/${gameId}/boards/${ids.u2}`)).marks[4]).toBe(true);
  });
  it('marked=false on an unmarked square is a no-op', async () => {
    const { gameId, ids } = await playing();
    const res = await callAs('u2', 'toggleMark', { gameId, cellIndex: 3, marked: false });
    expect(res.marks[3]).toBe(false);
    expect((await readAdmin(`games/${gameId}/boards/${ids.u2}`)).marks.filter(Boolean)).toHaveLength(1);
  });
  it('marked omitted flips (0.1.0 clients)', async () => {
    const { gameId, ids } = await playing();
    await mark('u2', gameId, 3);
    expect((await readAdmin(`games/${gameId}/boards/${ids.u2}`)).marks[3]).toBe(true);
    await mark('u2', gameId, 3);
    expect((await readAdmin(`games/${gameId}/boards/${ids.u2}`)).marks[3]).toBe(false);
  });
  it('rejects a non-boolean marked', async () => {
    const { gameId } = await playing();
    expect(await appCodeOf(callAs('u2', 'toggleMark', { gameId, cellIndex: 3, marked: 'yes' }))).toBe('invalid-cell');
  });
  it('validates cellIndex', async () => {
    const { gameId, ids } = await playing();
    for (const cellIndex of [25, -1, 1.5, '3', null, undefined]) {
      expect(await appCodeOf(mark('u2', gameId, cellIndex as any))).toBe('invalid-cell');
    }
    await mark('u2', gameId, 12);
    expect((await readAdmin(`games/${gameId}/boards/${ids.u2}`)).marks.filter(Boolean)).toHaveLength(1);
  });
  it('rejects marks in lobby and after end', async () => {
    const l = await lobby();
    expect(await appCodeOf(mark('u2', l.gameId, 0))).toBe('wrong-stage');
    await callAs('u1', 'launchGame', { gameId: l.gameId });
    await callAs('u1', 'endGame', { gameId: l.gameId });
    expect(await appCodeOf(mark('u2', l.gameId, 0))).toBe('wrong-stage');
  });
  it('rejects non-members', async () => {
    const { gameId } = await playing();
    expect(await appCodeOf(mark('u9', gameId, 0))).toBe('https:functions/permission-denied');
  });
});

describe('endGame', () => {
  it('rejects non-host, ends for host, rejects non-playing', async () => {
    const l = await lobby();
    expect(await appCodeOf(callAs('u1', 'endGame', { gameId: l.gameId }))).toBe('wrong-stage');
    await callAs('u1', 'launchGame', { gameId: l.gameId });
    expect(await appCodeOf(callAs('u2', 'endGame', { gameId: l.gameId }))).toBe('not-host');
    await callAs('u1', 'endGame', { gameId: l.gameId });
    const g = await readAdmin(`games/${l.gameId}`);
    expect(g.stage).toBe('ended');
    expect(typeof g.endedAt).toBe('number');
  });
});
