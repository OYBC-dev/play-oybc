import { buildRoster, retireNameInText, rosterHas } from '../src/roster';
import { parseMentions, resolveMentionRefs } from '../src/mentions';
import { buildPoolView, canBeDealt, canSeeText, mentionContext } from '../src/visibility';
import { dealableCounts } from '../src/readiness';
import { dealBoard } from '../src/deal';
import { makeSeededRng } from './seededRng';
import { PoolTask, Seat, TaskMentions } from '../src/types';

const seat = (seatId: string, name: string, joinedAt = 0): Seat => ({ seatId, name, joinedAt });
const seats = [seat('s1', 'Jo'), seat('s2', 'Jessie'), seat('s3', 'Seth')];
const task = (id: string, text: string, m: Partial<TaskMentions> = {}, createdAt = 0): PoolTask => ({
  id, text, authorSeatId: 's1', createdAt, mentions: { seatIds: [], someone: false, anyone: false, ...m },
});
const none = new Map<string, string>();

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
    expect(buildRoster(tasks, seats, new Map([['jess', 's2']]))).toEqual([{ key: 'jess', display: 'Jess', seatId: 's2' }]);
    expect(buildRoster(tasks, seats, new Map([['jess', 'gone']]))).toEqual([{ key: 'jess', display: 'Jess', seatId: null }]);
    expect(rosterHas(buildRoster(tasks, seats, none), 'jess')).toBe(true);
    expect(rosterHas(buildRoster(tasks, seats, none), 'zed')).toBe(false);
  });
  it('a name someone joined under exactly is no row, even when a stale binding points elsewhere', () => {
    const tasks = [task('a', '@Seth naps', { names: ['seth'] })];
    expect(buildRoster(tasks, seats, new Map([['seth', 's2']]))).toEqual([]);
  });
});

describe('a bound name', () => {
  const bindings = new Map([['jess', 's2']]);
  const t = task('a', '@Jess sings', { names: ['jess'] });
  it('resolves to the seat for parse, display, visibility and dealing', () => {
    expect(parseMentions('@Jess sings', seats, bindings)).toEqual({ seatIds: ['s2'], someone: false, anyone: false });
    expect(resolveMentionRefs('@Jess sings', seats, null, bindings)).toEqual({ text: 'Jessie sings', refs: [[0, 6]] });
    const ctx = mentionContext([t], seats, bindings);
    expect(canSeeText(t, 's2', ctx)).toBe(false);
    expect(canBeDealt(t, 's2', ctx)).toBe(false);
    expect(canSeeText(t, 's3', ctx)).toBe(true);
    expect(canBeDealt(t, 's3', ctx)).toBe(true);
    expect(buildPoolView([t], seats, 's3', ctx)[0]).toMatchObject({ text: 'Jessie sings', refs: [[0, 6]] });
    expect(dealableCounts([t], seats, { freeSpace: true, bindings })).toEqual({ s1: 1, s2: 0, s3: 1 });
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
    const b = dealBoard([...plain, named, t], seats, 's3', makeSeededRng(1), { freeSpace: true, bindings });
    expect(b.find((c) => c.kind === 'task' && c.taskId === 'a')).toEqual({ kind: 'task', taskId: 'a', text: 'Jessie sings', refs: [[0, 6]] });
  });
});

describe('retireNameInText', () => {
  it('drops the @ of whole tokens with that key only', () => {
    expect(retireNameInText('@Jess and @jess hug @Jessica', 'jess', seats)).toBe('Jess and jess hug @Jessica');
    expect(retireNameInText("@Jess's hat", 'jess', seats)).toBe("Jess's hat");
    expect(retireNameInText('@Jo hugs @Jess', 'jo', seats)).toBe('@Jo hugs @Jess');
    expect(retireNameInText('plain', 'jess', seats)).toBe('plain');
  });
  it('the rewritten text has no mention and no ref', () => {
    const text = retireNameInText('@Jess sings', 'jess', seats);
    expect(parseMentions(text, seats)).toEqual({ seatIds: [], someone: false, anyone: false });
    expect(resolveMentionRefs(text, seats, null)).toEqual({ text: 'Jess sings', refs: [] });
  });
});
