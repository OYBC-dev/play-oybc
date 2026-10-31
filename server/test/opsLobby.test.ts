import { describe, expect, it } from 'vitest';
import { canSeeText, mentionContext, resolveMentionRefs, type PoolTask } from 'game-core';
import { AppError } from '../src/errors';
import { MemoryPersistence } from '../src/room/persistence';
import { addTask, bindName, claimGame, deleteTask, join, retireName, setOptions, type OpCtx } from '../src/room/ops';
import { buildSections } from '../src/room/sections';
import { GameState } from '../src/room/state';

const NOW = 1_700_000_000_000;
let clock = NOW;
let counter = 0;
const ctxFor = (uid: string, now = clock): OpCtx => ({ uid, now, rng: () => 0.5, newId: () => `id${++counter}` });
const fresh = () => new GameState(new MemoryPersistence(), { now: () => clock });
const codeOf = (fn: () => unknown): string | undefined => {
  try { fn(); } catch (e) { if (e instanceof AppError) return e.code; throw e; }
  return undefined;
};

/** Stephen (host, u1) + Cody (u2) + Seth (u3). */
function setup() {
  const state = fresh();
  const g = claimGame(state, ctxFor('u1'), { gameId: 'g1', code: 'ABCDE', name: 'Stephen' }).result;
  const s2 = join(state, ctxFor('u2'), { name: 'Cody' }).result;
  const s3 = join(state, ctxFor('u3'), { name: 'Seth' }).result;
  if (s2.status === 'reclaim-pending' || s3.status === 'reclaim-pending') throw new Error('setup');
  return { state, s1: g.seatId, s2: s2.seatId, s3: s3.seatId };
}
let n = 0;
const add = (state: GameState, uid: string, text: string) => addTask(state, ctxFor(uid), { taskId: `t${++n}`, text }).result.taskId;
const view = (state: GameState, seat: string) => buildSections(state, seat, ['view']).view!;

describe('claimGame', () => {
  it('creates game, code, seat, member and empty view', () => {
    const state = fresh();
    const out = claimGame(state, ctxFor('u1'), { gameId: 'g1', code: 'ABCDE', name: 'Stephen' });
    const { gameId, code, seatId } = out.result;
    expect(state.game).toMatchObject({ gameId, stage: 'lobby', hostSeatId: seatId, bingoCount: 0, code, reviewGate: false, createdAt: NOW });
    expect(state.game!.lastMutationAt).toBe(NOW);
    expect(state.seatOf('u1')).toBe(seatId);
    expect(buildSections(state, seatId, ['view']).view).toEqual([]);
    expect(out.push.all).toEqual(['game', 'seats', 'view', 'roster']);
  });
  it('rejects an invalid name', () => {
    expect(codeOf(() => claimGame(fresh(), ctxFor('u1'), { gameId: 'g', code: 'ABCDE', name: '' }))).toBe('invalid-name');
  });
  it('takes the settings chosen before creation: free space and a trimmed game name; defaults off and absent', () => {
    const state = fresh();
    claimGame(state, ctxFor('u1'), { gameId: 'g1', code: 'ABCDE', name: 'Stephen', gameName: "  Halloween   at Stephen's ", freeSpace: true });
    expect(state.game).toMatchObject({ freeSpace: true, gameName: "Halloween at Stephen's" });
    const g = buildSections(state, state.seatOf('u1'), ['game']).game!;
    expect(g).toMatchObject({ gameName: "Halloween at Stephen's", freeSpace: true, tasksPerBoard: 24 });
    const plain = fresh();
    claimGame(plain, ctxFor('u1'), { gameId: 'g2', code: 'ABCDF', name: 'Stephen', gameName: '   ' });
    expect(plain.game!.freeSpace).toBe(false);
    expect('gameName' in plain.game!).toBe(false);
    expect(codeOf(() => claimGame(fresh(), ctxFor('u1'), { gameId: 'g3', code: 'ABCDG', name: 'S', gameName: 'x'.repeat(41) }))).toBe('invalid-argument');
    // Persists through a reload.
    const p = new MemoryPersistence();
    claimGame(new GameState(p, { now: () => clock }), ctxFor('u1'), { gameId: 'g4', code: 'ABCDH', name: 'S', gameName: 'Party', freeSpace: true });
    expect(new GameState(p, { now: () => clock }).game).toMatchObject({ gameName: 'Party', freeSpace: true });
  });
  it('claimGame on an occupied object is resource-exhausted', () => {
    const { state } = setup();
    expect(codeOf(() => claimGame(state, ctxFor('u9'), { gameId: 'g2', code: 'ZZZZZ', name: 'X' }))).toBe('resource-exhausted');
  });
});

describe('join', () => {
  it('joins, then resumes on a second call without a new seat', () => {
    const state = fresh();
    claimGame(state, ctxFor('u1'), { gameId: 'g1', code: 'ABCDE', name: 'Stephen' });
    const j = join(state, ctxFor('u2'), { name: 'Cody' }).result;
    expect(j.status).toBe('joined');
    expect(buildSections(state, state.seatOf('u2'), ['view']).view).toEqual([]);
    const again = join(state, ctxFor('u2'), { name: 'Whoever' }).result;
    expect(again).toMatchObject({ status: 'resumed', seatId: (j as { seatId: string }).seatId });
    expect(state.seats.size).toBe(2);
    expect(state.seatOf('u2')).toBe((j as { seatId: string }).seatId);
  });
  it('a taken name is name-taken with the held name, so the newcomer picks another; reclaim is explicit', () => {
    const state = fresh();
    claimGame(state, ctxFor('u1'), { gameId: 'g1', code: 'ABCDE', name: 'Stephen' });
    join(state, ctxFor('u2'), { name: 'Josh' });
    let err: AppError | undefined;
    try { join(state, ctxFor('u3'), { name: ' josh ' }); } catch (e) { err = e as AppError; }
    expect(err?.code).toBe('name-taken');
    expect(err?.details?.name).toBe('Josh');
    expect(state.seats.size).toBe(2);
    expect(state.reclaims.size).toBe(0);
    expect(join(state, ctxFor('u3'), { name: 'Josh B' }).result.status).toBe('joined');
    expect(join(state, ctxFor('u4'), { name: 'Josh', reclaim: true }).result.status).toBe('reclaim-pending');
  });
  it('creates a reclaim request on a name clash', () => {
    const state = fresh();
    claimGame(state, ctxFor('u1'), { gameId: 'g1', code: 'ABCDE', name: 'Stephen' });
    const cody = join(state, ctxFor('u2'), { name: 'Cody' }).result as { seatId: string };
    for (const [i, variant] of ['CODY', 'Cody'].entries()) {
      expect(join(state, ctxFor(`v${i}`), { name: variant, reclaim: true }).result.status).toBe('reclaim-pending');
    }
    const out = join(state, ctxFor('u3'), { name: ' cody ', reclaim: true });
    expect(out.result.status).toBe('reclaim-pending');
    const rid = (out.result as { reclaimId: string }).reclaimId;
    expect(state.reclaims.get(rid)).toMatchObject({ requesterUid: 'u3', seatId: cody.seatId, status: 'pending' });
    expect(state.seats.size).toBe(2);
    expect(out.push.perSeat).toEqual({ [state.game!.hostSeatId]: ['reclaims'] });
  });
  it('returns the same pending reclaim on repeat requests', () => {
    const state = fresh();
    claimGame(state, ctxFor('u1'), { gameId: 'g1', code: 'ABCDE', name: 'Stephen' });
    join(state, ctxFor('u2'), { name: 'Cody' });
    const a = join(state, ctxFor('u3'), { name: 'Cody', reclaim: true }).result as { reclaimId: string };
    const b = join(state, ctxFor('u3'), { name: 'cody', reclaim: true }).result as { reclaimId: string };
    expect(b.reclaimId).toBe(a.reclaimId);
    expect(state.reclaims.size).toBe(1);
  });
  it('refuses a new reclaim within the cooldown after a denial', () => {
    const state = fresh();
    claimGame(state, ctxFor('u1'), { gameId: 'g1', code: 'ABCDE', name: 'Stephen' });
    join(state, ctxFor('u2'), { name: 'Cody' });
    const a = join(state, ctxFor('u3'), { name: 'Cody', reclaim: true }).result as { reclaimId: string };
    state.putReclaim({ ...state.reclaims.get(a.reclaimId)!, status: 'denied', resolvedAt: NOW });
    expect(codeOf(() => join(state, ctxFor('u3', NOW + 30_000), { name: 'Cody', reclaim: true }))).toBe('reclaim-cooldown');
    expect(join(state, ctxFor('u3', NOW + 60_000), { name: 'Cody', reclaim: true }).result.status).toBe('reclaim-pending');
  });
  it('member of an ended game resumes', () => {
    const { state, s1 } = setup();
    state.putGame({ ...state.game!, stage: 'ended' });
    expect(join(state, ctxFor('u1'), { name: 'x' }).result).toMatchObject({ status: 'resumed', seatId: s1 });
  });
  it('empty name fails', () => {
    const { state } = setup();
    expect(codeOf(() => join(state, ctxFor('u9'), { name: '' }))).toBe('invalid-name');
  });
  it('every op but claimGame throws game-not-found on an empty room', () => {
    const state = fresh();
    expect(codeOf(() => join(state, ctxFor('u1'), { name: 'X' }))).toBe('game-not-found');
    expect(codeOf(() => addTask(state, ctxFor('u1'), { taskId: 't', text: 'x' }))).toBe('game-not-found');
    expect(codeOf(() => deleteTask(state, ctxFor('u1'), { taskId: 't' }))).toBe('game-not-found');
  });
  it('deals a 25-cell board when joining a playing game', () => {
    const { state, s1 } = setup();
    for (let i = 0; i < 30; i++) {
      state.putTask({ taskId: `p${i}`, text: `task ${i}`, authorSeatId: s1, mentions: { seatIds: [], someone: false, anyone: false }, createdAt: i });
    }
    state.putGame({ ...state.game!, stage: 'playing' });
    const out = join(state, ctxFor('u4'), { name: 'Dana' });
    const seatId = (out.result as { seatId: string }).seatId;
    expect(out.result.status).toBe('joined');
    const board = state.boards.get(seatId)!;
    expect(board.cells).toHaveLength(25);
    expect(board.marks).toHaveLength(25);
    expect(board.cells[12]).toMatchObject({ kind: 'task' });
    expect(board.marks.filter(Boolean)).toHaveLength(0);
    expect(out.push.all).toEqual(['game', 'seats', 'view', 'roster', 'standings']);
    expect(out.push.perSeat).toEqual({ [seatId]: ['board'] });
  });
  it('a playing-stage join with free space gets the free centre pre-marked', () => {
    const { state, s1 } = setup();
    for (let i = 0; i < 30; i++) {
      state.putTask({ taskId: `p${i}`, text: `task ${i}`, authorSeatId: s1, mentions: { seatIds: [], someone: false, anyone: false }, createdAt: i });
    }
    state.putGame({ ...state.game!, stage: 'playing', freeSpace: true });
    const seatId = (join(state, ctxFor('u4'), { name: 'Dana' }).result as { seatId: string }).seatId;
    const board = state.boards.get(seatId)!;
    expect(board.cells[12]).toEqual({ kind: 'free' });
    expect(board.marks[12]).toBe(true);
    expect(board.marks.filter(Boolean)).toHaveLength(1);
  });
  it('joining a playing game with a thin pool is not-ready and seats nobody', () => {
    const { state } = setup();
    state.putGame({ ...state.game!, stage: 'playing' });
    expect(codeOf(() => join(state, ctxFor('u4'), { name: 'Dana' }))).toBe('not-ready');
    expect(state.seats.size).toBe(3);
    expect(state.seatOf('u4')).toBeNull();
  });
  it('rejects joining an ended game', () => {
    const { state } = setup();
    state.putGame({ ...state.game!, stage: 'ended' });
    expect(codeOf(() => join(state, ctxFor('u9'), { name: 'Zed' }))).toBe('game-ended');
  });
  it('join as the 51st seat is resource-exhausted', () => {
    const state = fresh();
    claimGame(state, ctxFor('u1'), { gameId: 'g1', code: 'ABCDE', name: 'P0' });
    for (let i = 1; i < 50; i++) join(state, ctxFor(`u${i + 1}`), { name: `P${i}` });
    expect(state.seats.size).toBe(50);
    expect(codeOf(() => join(state, ctxFor('u99'), { name: 'Extra' }))).toBe('resource-exhausted');
  });
});

describe('membership (whoAmI)', () => {
  it('returns seat for members (any stage), null for others', () => {
    const { state, s1 } = setup();
    expect(state.seatOf('u1')).toBe(s1);
    expect(state.seatOf('u9')).toBeNull();
    state.putGame({ ...state.game!, stage: 'ended' });
    expect(state.seatOf('u1')).toBe(s1);
  });
});

describe('addTask', () => {
  it('hides a task from the seat it mentions', () => {
    const { state, s1, s2, s3 } = setup();
    const taskId = add(state, 'u2', '@Stephen falls asleep');
    expect(state.tasks.get(taskId)!.mentions.seatIds).toEqual([s1]);
    expect(view(state, s1)[0].text).toBeNull();
    expect(view(state, s2)[0]).toMatchObject({ text: 'Stephen falls asleep', refs: [[0, 7]] });
    expect(view(state, s3)[0]).toMatchObject({ text: 'Stephen falls asleep', refs: [[0, 7]] });
  });
  it('@someone is visible only to its author', () => {
    const { state, s1, s2, s3 } = setup();
    add(state, 'u3', '@someone takes a shot');
    expect(view(state, s1)[0].text).toBeNull();
    expect(view(state, s2)[0].text).toBeNull();
    expect(view(state, s3)[0]).toMatchObject({ text: 'Someone takes a shot', refs: [[0, 7]] });
  });
  describe('a name nobody here has yet', () => {
    const game = (state: GameState, seat: string) => buildSections(state, seat, ['game']).game!;
    it('is accepted and stored as an unbound name', () => {
      const { state } = setup();
      const id = add(state, 'u2', '@Bob sings');
      expect(state.tasks.get(id)!.mentions).toEqual({ seatIds: [], someone: false, anyone: false, names: ['bob'] });
    });
    it('is read by the author and by identified seats only, shown without its @', () => {
      const { state, s1, s2, s3 } = setup();
      add(state, 'u2', '@Bob sings');
      expect(view(state, s2)[0]).toMatchObject({ text: 'Bob sings', refs: [[0, 3]], mine: true });
      expect(view(state, s1)[0].text).toBeNull();
      expect(view(state, s3)[0].text).toBeNull();
      add(state, 'u1', '@Seth naps');
      expect(view(state, s3)[0].text).toBe('Bob sings');
      expect(view(state, s1)[0].text).toBeNull();
    });
    it('binds itself when that person joins: hidden from them, open to the others, counts moved', () => {
      const { state, s1, s2, s3 } = setup();
      add(state, 'u2', '@Bob sings');
      // Launch releases unbound names, so the count holds nobody back.
      expect(game(state, s1).dealable).toEqual({ [s1]: 1, [s2]: 1, [s3]: 1 });
      const out = join(state, ctxFor('u4'), { name: 'bob' });
      const s4 = (out.result as { seatId: string }).seatId;
      expect(out.push.all).toEqual(expect.arrayContaining(['game', 'seats', 'view']));
      expect(view(state, s4)[0].text).toBeNull();
      expect(view(state, s1)[0]).toMatchObject({ text: 'bob sings', refs: [[0, 3]] });
      expect(view(state, s3)[0].text).toBe('bob sings');
      expect(game(state, s1).dealable).toEqual({ [s1]: 1, [s2]: 1, [s3]: 1, [s4]: 0 });
    });
    it('is refused with the token when it nearly names someone who is here', () => {
      const { state } = setup();
      let err: AppError | undefined;
      try { add(state, 'u1', '@Cod streaks'); } catch (e) { err = e as AppError; }
      expect(err?.code).toBe('unknown-mention');
      expect(err?.details?.token).toBe('@Cod');
      expect(codeOf(() => add(state, 'u1', '@Cody streaks'))).toBeUndefined();
    });
    it('is listed on the roster as typed, unbound, and leaves it when its last task is deleted', () => {
      const { state, s1 } = setup();
      const id = add(state, 'u2', '@Jess sings');
      expect(buildSections(state, s1, ['roster']).roster).toEqual([{ key: 'jess', display: 'Jess', seatId: null }]);
      deleteTask(state, ctxFor('u2'), { taskId: id });
      expect(buildSections(state, s1, ['roster']).roster).toEqual([]);
    });
    it('a task row stored without names still loads', () => {
      const { state, s1, s3 } = setup();
      state.putTask({ taskId: 'old', text: 'plain', authorSeatId: s1, mentions: { seatIds: [], someone: false, anyone: false }, createdAt: 1 });
      expect(view(state, s3)[0].text).toBe('plain');
    });
  });
  describe('bindName / retireName', () => {
    const roster = (state: GameState, seat: string) => buildSections(state, seat, ['roster']).roster!;
    const game = (state: GameState, seat: string) => buildSections(state, seat, ['game']).game!;
    it('the host binds a name to a player who joined under a nickname: hidden from them, shown as their name, counts moved', () => {
      const { state, s1, s2, s3 } = setup();
      add(state, 'u1', '@Jess sings');
      // Nobody is identified: hidden from Cody and Seth; launch would release the name, so every count holds it.
      expect(view(state, s2)[0].text).toBeNull();
      expect(game(state, s1).dealable).toEqual({ [s1]: 1, [s2]: 1, [s3]: 1 });
      const out = bindName(state, ctxFor('u1'), { key: 'Jess', seatId: s2 });
      expect(out.push.all).toEqual(['game', 'view', 'roster']);
      expect(roster(state, s1)).toEqual([{ key: 'jess', display: 'Jess', seatId: s2 }]);
      expect(view(state, s2)[0].text).toBeNull();
      expect(view(state, s3)[0]).toMatchObject({ text: 'Cody sings', refs: [[0, 4]] });
      expect(view(state, s1)[0]).toMatchObject({ text: 'Cody sings', refs: [[0, 4]] });
      expect(game(state, s1).dealable).toEqual({ [s1]: 1, [s2]: 0, [s3]: 1 });
      // Unbind: back to nobody yet.
      bindName(state, ctxFor('u1'), { key: 'jess', seatId: null });
      expect(roster(state, s1)).toEqual([{ key: 'jess', display: 'Jess', seatId: null }]);
      expect(view(state, s3)[0].text).toBeNull();
    });
    it('a bound name is typed as that player (stored as the name): a later @Jess task is Cody\'s, and Cody cannot write one', () => {
      const { state, s2, s3 } = setup();
      add(state, 'u1', '@Jess sings');
      bindName(state, ctxFor('u1'), { key: 'jess', seatId: s2 });
      const id = add(state, 'u1', '@Jess dances');
      expect(state.tasks.get(id)!.mentions).toEqual({ seatIds: [], someone: false, anyone: false, names: ['jess'] });
      expect(view(state, s2).find((e) => e.taskId === id)!.text).toBeNull();
      expect(codeOf(() => add(state, 'u2', '@Jess trips'))).toBe('self-mention');
      // Rebinding to Seth moves every @Jess task, the later one included.
      bindName(state, ctxFor('u1'), { key: 'jess', seatId: s3 });
      expect(view(state, s2).find((e) => e.taskId === id)!.text).toBe('Seth dances');
      expect(view(state, s3).find((e) => e.taskId === id)!.text).toBeNull();
    });
    it('a join under a bound name files a reclaim on the bound seat (the binding wins)', () => {
      const { state, s2 } = setup();
      add(state, 'u1', '@Jess sings');
      bindName(state, ctxFor('u1'), { key: 'jess', seatId: s2 });
      expect(codeOf(() => join(state, ctxFor('u4'), { name: 'Jess' }))).toBe('name-taken');
      const out = join(state, ctxFor('u4'), { name: 'Jess', reclaim: true }).result;
      expect(out.status).toBe('reclaim-pending');
      expect([...state.reclaims.values()][0]).toMatchObject({ seatId: s2, name: 'Jess' });
      expect(state.seats.size).toBe(3);
    });
    it('bindings survive a reload', () => {
      const p = new MemoryPersistence();
      const state = new GameState(p, { now: () => clock });
      claimGame(state, ctxFor('u1'), { gameId: 'g1', code: 'ABCDE', name: 'Stephen' });
      const s2 = (join(state, ctxFor('u2'), { name: 'Cody' }).result as { seatId: string }).seatId;
      add(state, 'u1', '@Jess sings');
      bindName(state, ctxFor('u1'), { key: 'jess', seatId: s2 });
      const again = new GameState(p, { now: () => clock });
      expect(again.names.get('jess')).toEqual({ seatId: s2, retired: false });
    });
    it('permissions and validation', () => {
      const { state, s2 } = setup();
      add(state, 'u1', '@Jess sings');
      expect(codeOf(() => bindName(state, ctxFor('u2'), { key: 'jess', seatId: s2 }))).toBe('not-host');
      expect(codeOf(() => bindName(state, ctxFor('u1'), { key: 'zed', seatId: s2 }))).toBe('name-not-found');
      expect(codeOf(() => bindName(state, ctxFor('u1'), { key: 'jess', seatId: 'nope' }))).toBe('seat-not-found');
      expect(codeOf(() => bindName(state, ctxFor('u1'), { key: 42, seatId: s2 }))).toBe('invalid-argument');
      expect(codeOf(() => bindName(state, ctxFor('u1'), { key: 'jess' }))).toBe('invalid-argument');
      expect(codeOf(() => retireName(state, ctxFor('u2'), { key: 'jess' }))).toBe('not-host');
      expect(codeOf(() => retireName(state, ctxFor('u1'), { key: 'zed' }))).toBe('name-not-found');
    });
    it('retire drops the hold: the name leaves the roster, its tasks stay bold and open to everyone', () => {
      const { state, s1, s2, s3 } = setup();
      const a = add(state, 'u1', '@Jess sings with @Cody');
      const b = add(state, 'u3', "@Jess's hat");
      const out = retireName(state, ctxFor('u1'), { key: 'Jess' });
      expect(out.push.all).toEqual(['game', 'view', 'roster']);
      expect(state.tasks.get(a)!.text).toBe('@Jess sings with @Cody');
      expect(state.names.get('jess')).toEqual({ seatId: null, retired: true });
      expect(roster(state, s1)).toEqual([]);
      expect(view(state, s3).find((e) => e.taskId === a)).toMatchObject({ text: 'Jess sings with Cody', refs: [[0, 4], [16, 20]] });
      expect(view(state, s2).find((e) => e.taskId === b)).toMatchObject({ text: "Jess's hat", refs: [[0, 4]] });
      expect(codeOf(() => bindName(state, ctxFor('u1'), { key: 'jess', seatId: s2 }))).toBe('name-not-found');
      // Someone who joins as Jess later is still kept from them.
      const s4 = (join(state, ctxFor('u4'), { name: 'Jess' }).result as { seatId: string }).seatId;
      expect(view(state, s4).find((e) => e.taskId === a)!.text).toBeNull();
    });
  });
  it('a text already in the pool is duplicate-task, whoever wrote it, ignoring case, spacing and trailing punctuation', () => {
    const { state } = setup();
    add(state, 'u2', 'Someone spills a drink');
    expect(codeOf(() => add(state, 'u3', ' someone  SPILLS a drink! '))).toBe('duplicate-task');
    expect(codeOf(() => add(state, 'u2', 'Someone spills a drink.'))).toBe('duplicate-task');
    expect(codeOf(() => add(state, 'u3', 'Someone spills their drink'))).toBeUndefined();
    expect(state.tasks.size).toBe(2);
  });
  it('rejects self-mention and bad text', () => {
    const { state } = setup();
    expect(codeOf(() => add(state, 'u2', '@Cody dances'))).toBe('self-mention');
    expect(codeOf(() => add(state, 'u2', ''))).toBe('invalid-text');
    expect(codeOf(() => add(state, 'u2', '   '))).toBe('invalid-text');
    expect(codeOf(() => add(state, 'u2', 'x'.repeat(121)))).toBe('invalid-text');
    for (const text of [{}, 42, ['x'], null]) {
      expect(codeOf(() => add(state, 'u2', text as never))).toBe('invalid-text');
    }
  });
  it('trims text and accepts exactly 120 chars', () => {
    const { state } = setup();
    const taskId = add(state, 'u2', `  ${'x'.repeat(120)}  `);
    expect(state.tasks.get(taskId)!.text).toBe('x'.repeat(120));
  });
  it('rejects non-members', () => {
    const { state } = setup();
    expect(codeOf(() => add(state, 'u9', 'hi'))).toBe('permission-denied');
  });
  it('keeps shortfalls current and never stores zeros', () => {
    const { state, s1, s2, s3 } = setup();
    const sf = () => buildSections(state, s1, ['game']).game!.shortfalls;
    expect(sf()).toEqual({ [s1]: 25, [s2]: 25, [s3]: 25 });
    for (let i = 0; i < 24; i++) add(state, 'u1', `plain ${i}`);
    add(state, 'u3', '@Cody wins');
    expect(sf()).toEqual({ [s2]: 1 });
    add(state, 'u1', 'one more');
    expect(sf()).toEqual({});
  });
  it('10 adds from 3 users all land in every view', () => {
    const { state, s1, s2, s3 } = setup();
    const users = ['u1', 'u2', 'u3'];
    for (let i = 0; i < 10; i++) add(state, users[i % 3], `t${i}`);
    for (const s of [s1, s2, s3]) {
      expect(view(state, s).map((e) => e.text).sort()).toEqual(Array.from({ length: 10 }, (_, i) => `t${i}`).sort());
    }
  });
  it('addTask with a repeated taskId by the same author is a no-op', () => {
    const { state } = setup();
    const first = addTask(state, ctxFor('u2'), { taskId: 'dup', text: 'once' });
    const rev = state.game!.rev;
    const again = addTask(state, ctxFor('u2'), { taskId: 'dup', text: 'twice' });
    expect(again.result).toEqual({ taskId: 'dup' });
    expect(again.push.all).toEqual([]);
    expect(first.push.all).toEqual(['game', 'view', 'roster']);
    expect(state.tasks.size).toBe(1);
    expect(state.tasks.get('dup')!.text).toBe('once');
    expect(state.game!.rev).toBe(rev);
  });
  it('addTask past 500 tasks is resource-exhausted', () => {
    const { state, s1 } = setup();
    for (let i = 0; i < 500; i++) {
      state.putTask({ taskId: `b${i}`, text: `b${i}`, authorSeatId: s1, mentions: { seatIds: [], someone: false, anyone: false }, createdAt: i });
    }
    expect(codeOf(() => add(state, 'u2', 'one too many'))).toBe('resource-exhausted');
  });
});

describe('deleteTask', () => {
  it('author deletes own; non-author non-host denied; host deletes any', () => {
    const { state, s1 } = setup();
    const a = add(state, 'u2', 'mine');
    const b = add(state, 'u2', 'other');
    expect(codeOf(() => deleteTask(state, ctxFor('u3'), { taskId: a }))).toBe('permission-denied');
    deleteTask(state, ctxFor('u2'), { taskId: a });
    expect(view(state, s1).map((e) => e.taskId)).toEqual([b]);
    const out = deleteTask(state, ctxFor('u1'), { taskId: b });
    expect(out.push.all).toEqual(['game', 'view', 'roster']);
    for (const s of state.seats.keys()) expect(view(state, s)).toEqual([]);
    expect(codeOf(() => deleteTask(state, ctxFor('u1'), { taskId: b }))).toBe('not-found');
  });
});

describe('taskId validation', () => {
  it('addTask and deleteTask reject a missing, empty, non-string or over-64-char taskId', () => {
    const { state } = setup();
    for (const taskId of [undefined, '', 42, null, {}, 'x'.repeat(65)]) {
      expect(codeOf(() => addTask(state, ctxFor('u2'), { taskId: taskId as never, text: 'hi' }))).toBe('invalid-argument');
      expect(codeOf(() => deleteTask(state, ctxFor('u2'), { taskId: taskId as never }))).toBe('invalid-argument');
    }
    expect(state.tasks.size).toBe(0);
    expect(addTask(state, ctxFor('u2'), { taskId: 'x'.repeat(64), text: 'hi' }).result).toEqual({ taskId: 'x'.repeat(64) });
    expect(deleteTask(state, ctxFor('u2'), { taskId: 'x'.repeat(64) }).result).toEqual({});
  });
});

describe('setOptions', () => {
  it('a new game has free space off', () => {
    const { state, s1 } = setup();
    expect(state.game!.freeSpace).toBe(false);
    expect(buildSections(state, s1, ['game']).game).toMatchObject({ freeSpace: false, tasksPerBoard: 25 });
  });
  it('host in the lobby turns free space on and pushes game to all', () => {
    const { state, s1 } = setup();
    const out = setOptions(state, ctxFor('u1'), { freeSpace: true });
    expect(state.game!.freeSpace).toBe(true);
    expect(out.push).toEqual({ all: ['game'] });
    expect(buildSections(state, s1, ['game']).game).toMatchObject({ freeSpace: true, tasksPerBoard: 24 });
    setOptions(state, ctxFor('u1'), { freeSpace: false });
    expect(state.game!.freeSpace).toBe(false);
  });
  it('a guest is not-host', () => {
    const { state } = setup();
    expect(codeOf(() => setOptions(state, ctxFor('u2'), { freeSpace: true }))).toBe('not-host');
    expect(state.game!.freeSpace).toBe(false);
  });
  it('while playing is wrong-stage', () => {
    const { state } = setup();
    state.putGame({ ...state.game!, stage: 'playing' });
    expect(codeOf(() => setOptions(state, ctxFor('u1'), { freeSpace: true }))).toBe('wrong-stage');
  });
  it('a non-boolean is invalid-argument', () => {
    const { state } = setup();
    for (const freeSpace of ['x', 1, null, undefined]) {
      expect(codeOf(() => setOptions(state, ctxFor('u1'), { freeSpace: freeSpace as unknown as boolean }))).toBe('invalid-argument');
    }
    expect(state.game!.freeSpace).toBe(false);
  });
});

describe('stage', () => {
  it('rejects add and delete outside the lobby', () => {
    const { state } = setup();
    const taskId = add(state, 'u2', 'hi');
    state.putGame({ ...state.game!, stage: 'playing' });
    expect(codeOf(() => add(state, 'u2', 'again'))).toBe('wrong-stage');
    expect(codeOf(() => deleteTask(state, ctxFor('u2'), { taskId }))).toBe('wrong-stage');
  });
});

describe('leak check', () => {
  it('no view entry shows text a viewer may not see', () => {
    const { state, s1, s2, s3 } = setup();
    add(state, 'u2', '@Stephen falls asleep');
    add(state, 'u3', '@someone takes a shot');
    add(state, 'u1', '@anyone cheers');
    add(state, 'u1', '@Cody and @Seth hug');
    add(state, 'u2', 'plain');
    const tasks = new Map<string, PoolTask>(state.poolTasks().map((t) => [t.id, t]));
    const ctx = mentionContext(state.poolTasks(), state.seatList());
    expect(tasks.size).toBe(5);
    for (const seat of [s1, s2, s3]) {
      const entries = view(state, seat);
      expect(entries).toHaveLength(5);
      for (const e of entries) {
        const t = tasks.get(e.taskId)!;
        expect(e.text === null).toBe(!canSeeText(t, seat, ctx));
        if (e.text !== null) expect(e.text).toBe(resolveMentionRefs(t.text, state.seatList(), 'Someone').text);
      }
    }
  });
});
