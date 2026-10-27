import { describe, expect, it } from 'vitest';
import { canSeeText, type PoolTask } from 'game-core';
import { AppError } from '../src/errors';
import { MemoryPersistence } from '../src/room/persistence';
import { addTask, claimGame, deleteTask, join, type OpCtx } from '../src/room/ops';
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
const errOf = (fn: () => unknown): AppError => {
  try { fn(); } catch (e) { return e as AppError; }
  throw new Error('did not throw');
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
    expect(out.push.all).toEqual(['game', 'seats', 'view']);
  });
  it('rejects an invalid name', () => {
    expect(codeOf(() => claimGame(fresh(), ctxFor('u1'), { gameId: 'g', code: 'ABCDE', name: '' }))).toBe('invalid-name');
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
  it('creates a reclaim request on a name clash', () => {
    const state = fresh();
    claimGame(state, ctxFor('u1'), { gameId: 'g1', code: 'ABCDE', name: 'Stephen' });
    const cody = join(state, ctxFor('u2'), { name: 'Cody' }).result as { seatId: string };
    for (const [i, variant] of ['CODY', 'Cody'].entries()) {
      expect(join(state, ctxFor(`v${i}`), { name: variant }).result.status).toBe('reclaim-pending');
    }
    const out = join(state, ctxFor('u3'), { name: ' cody ' });
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
    const a = join(state, ctxFor('u3'), { name: 'Cody' }).result as { reclaimId: string };
    const b = join(state, ctxFor('u3'), { name: 'cody' }).result as { reclaimId: string };
    expect(b.reclaimId).toBe(a.reclaimId);
    expect(state.reclaims.size).toBe(1);
  });
  it('refuses a new reclaim within the cooldown after a denial', () => {
    const state = fresh();
    claimGame(state, ctxFor('u1'), { gameId: 'g1', code: 'ABCDE', name: 'Stephen' });
    join(state, ctxFor('u2'), { name: 'Cody' });
    const a = join(state, ctxFor('u3'), { name: 'Cody' }).result as { reclaimId: string };
    state.putReclaim({ ...state.reclaims.get(a.reclaimId)!, status: 'denied', resolvedAt: NOW });
    expect(codeOf(() => join(state, ctxFor('u3', NOW + 30_000), { name: 'Cody' }))).toBe('reclaim-cooldown');
    expect(join(state, ctxFor('u3', NOW + 60_000), { name: 'Cody' }).result.status).toBe('reclaim-pending');
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
    expect(board.marks[12]).toBe(true);
    expect(board.marks.filter(Boolean)).toHaveLength(1);
    expect(out.push.perSeat).toEqual({ [seatId]: ['board'] });
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
    expect(view(state, s2)[0].text).toBe('@Stephen falls asleep');
    expect(view(state, s3)[0].text).toBe('@Stephen falls asleep');
  });
  it('@someone is visible only to its author', () => {
    const { state, s1, s2, s3 } = setup();
    add(state, 'u3', '@someone takes a shot');
    expect(view(state, s1)[0].text).toBeNull();
    expect(view(state, s2)[0].text).toBeNull();
    expect(view(state, s3)[0].text).toBe('@someone takes a shot');
  });
  it('carries the unresolved token on unknown-mention', () => {
    const { state } = setup();
    const err = errOf(() => add(state, 'u2', '@Bob sings'));
    expect(err.code).toBe('unknown-mention');
    expect(err.details?.token).toBe('@Bob');
  });
  it('rejects self-mention, unknown mention and bad text', () => {
    const { state } = setup();
    expect(codeOf(() => add(state, 'u2', '@Cody dances'))).toBe('self-mention');
    expect(codeOf(() => add(state, 'u2', '@Bob sings'))).toBe('unknown-mention');
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
    expect(sf()).toEqual({ [s1]: 24, [s2]: 24, [s3]: 24 });
    for (let i = 0; i < 23; i++) add(state, 'u1', `plain ${i}`);
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
    expect(first.push.all).toEqual(['game', 'view']);
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
    expect(out.push.all).toEqual(['game', 'view']);
    for (const s of state.seats.keys()) expect(view(state, s)).toEqual([]);
    expect(codeOf(() => deleteTask(state, ctxFor('u1'), { taskId: b }))).toBe('not-found');
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
    expect(tasks.size).toBe(5);
    for (const seat of [s1, s2, s3]) {
      const entries = view(state, seat);
      expect(entries).toHaveLength(5);
      for (const e of entries) {
        const t = tasks.get(e.taskId)!;
        expect(e.text === null).toBe(!canSeeText(t, seat));
        if (e.text !== null) expect(e.text).toBe(t.text);
      }
    }
  });
});
