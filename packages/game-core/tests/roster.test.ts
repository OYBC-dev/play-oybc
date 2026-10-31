import { buildRoster, rosterHas, unboundKeys } from '../src/roster';
import { parseMentions, resolveMentionRefs } from '../src/mentions';
import { buildPoolView, canBeDealt, canSeeText, mentionContext } from '../src/visibility';
import { dealableCounts } from '../src/readiness';
import { dealBoard } from '../src/deal';
import { makeSeededRng } from './seededRng';
import { NameState, PoolTask, Seat, TaskMentions } from '../src/types';

const seat = (seatId: string, name: string, joinedAt = 0): Seat => ({ seatId, name, joinedAt });
const seats = [seat('s1', 'Jo'), seat('s2', 'Jessie'), seat('s3', 'Seth')];
const task = (id: string, text: string, m: Partial<TaskMentions> = {}, createdAt = 0): PoolTask => ({
  id, text, authorSeatId: 's1', createdAt, mentions: { seatIds: [], someone: false, anyone: false, ...m },
});
const none = new Map<string, NameState>();
const bind = (key: string, seatId: string | null, retired = false) => new Map<string, NameState>([[key, { seatId, retired }]]);

describe('buildRoster', () => {
  it('lists unbound names as first typed, in order of first mention; own seat names are never rows', () => {
    const tasks = [task('b', '@Zed and @JESS dance', { names: ['zed', 'jess'] }, 2), task('a', '@jess sings @Jo', { names: ['jess'] }, 1)];
    expect(buildRoster(tasks, seats, none)).toEqual([
      { key: 'jess', display: 'jess', seatId: null },
      { key: 'zed', display: 'Zed', seatId: null },
    ]);
  });
  it('carries a binding to a seat that is here and drops one to a seat that is gone', () => {
    const tasks = [task('a', '@Jess sings', { names: ['jess'] })];
    expect(buildRoster(tasks, seats, bind('jess', 's2'))).toEqual([{ key: 'jess', display: 'Jess', seatId: 's2' }]);
    expect(buildRoster(tasks, seats, bind('jess', 'gone'))).toEqual([{ key: 'jess', display: 'Jess', seatId: null }]);
    expect(rosterHas(buildRoster(tasks, seats, none), 'jess')).toBe(true);
    expect(rosterHas(buildRoster(tasks, seats, none), 'zed')).toBe(false);
  });
  it('a name someone joined under exactly is no row, even when a stale binding points elsewhere', () => {
    const tasks = [task('a', '@Seth naps', { names: ['seth'] })];
    expect(buildRoster(tasks, seats, bind('seth', 's2'))).toEqual([]);
  });
  it('a retired name is no row; unboundKeys lists the rows bound to nobody', () => {
    const tasks = [task('a', '@Jess sings @Zed', { names: ['jess', 'zed'] })];
    expect(buildRoster(tasks, seats, bind('jess', null, true))).toEqual([{ key: 'zed', display: 'Zed', seatId: null }]);
    expect(unboundKeys(tasks, seats, none)).toEqual(['jess', 'zed']);
    expect(unboundKeys(tasks, seats, bind('jess', 's2'))).toEqual(['zed']);
  });
});

describe('a bound name', () => {
  const bindings = bind('jess', 's2');
  const t = task('a', '@Jess sings', { names: ['jess'] });
  it('resolves to the seat for parse, display, visibility and dealing', () => {
    // Stored as the name, never the seat, so a rebind re-resolves it.
    expect(parseMentions('@Jess sings', seats, bindings)).toEqual({ seatIds: [], someone: false, anyone: false, names: ['jess'] });
    expect(resolveMentionRefs('@Jess sings', seats, null, bindings)).toEqual({ text: 'Jessie sings', refs: [[0, 6]] });
    const ctx = mentionContext([t], seats, bindings);
    expect(canSeeText(t, 's2', ctx)).toBe(false);
    expect(canBeDealt(t, 's2', ctx)).toBe(false);
    expect(canSeeText(t, 's3', ctx)).toBe(true);
    expect(canBeDealt(t, 's3', ctx)).toBe(true);
    expect(buildPoolView([t], seats, 's3', ctx)[0]).toMatchObject({ text: 'Jessie sings', refs: [[0, 6]] });
    expect(dealableCounts([t], seats, { freeSpace: true, names: bindings })).toEqual({ s1: 1, s2: 0, s3: 1 });
  });
  it('identifies the bound seat and stays unbound for everyone when the seat is gone', () => {
    const other = task('z', '@Zed dances', { names: ['zed'] });
    const ctx = mentionContext([t, other], seats, bindings);
    expect(canSeeText(other, 's2', ctx)).toBe(true);
    const gone = mentionContext([t], [seats[0], seats[2]], bindings);
    expect(canSeeText(t, 's3', gone)).toBe(false);
  });
  it('a bound name shows the seat name on a dealt board', () => {
    const plain = Array.from({ length: 23 }, (_, i) => task('p' + i, 'plain ' + i));
    const named = task('n', '@Seth naps', { seatIds: ['s3'] });
    const b = dealBoard([...plain, named, t], seats, 's3', makeSeededRng(1), { freeSpace: true, names: bindings });
    expect(b.find((c) => c.kind === 'task' && c.taskId === 'a')).toEqual({ kind: 'task', taskId: 'a', text: 'Jessie sings', refs: [[0, 6]] });
  });
});

describe('a retired name', () => {
  const t = task('a', '@Jess sings', { names: ['jess'] });
  it('holds nobody back and still reads bold', () => {
    const retired = bind('jess', null, true);
    const ctx = mentionContext([t], seats, retired);
    expect(canSeeText(t, 's3', ctx)).toBe(true);
    expect(canBeDealt(t, 's3', ctx)).toBe(true);
    expect(buildPoolView([t], seats, 's3', ctx)[0]).toMatchObject({ text: 'Jess sings', refs: [[0, 4]] });
    // Jessie (s2) nearly carries the name, but the host said Jess is not coming: she reads it too.
    expect(canSeeText(t, 's2', ctx)).toBe(true);
    expect(dealableCounts([t], seats, { freeSpace: true, names: retired })).toEqual({ s1: 1, s2: 1, s3: 1 });
  });
  it('still protects the person once they join under that name', () => {
    const joined = [...seats, seat('s4', 'Jess')];
    const ctx = mentionContext([t], joined, bind('jess', null, true));
    expect(canSeeText(t, 's4', ctx)).toBe(false);
    expect(canBeDealt(t, 's4', ctx)).toBe(false);
  });
});
