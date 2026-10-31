import { assignAnyone, dealBoard } from '../src/deal';
import { dealableCounts, shortfalls } from '../src/readiness';
import { makeSeededRng } from './seededRng';
import { PoolTask, Seat } from '../src/types';

const seats: Seat[] = ['s1', 's2', 's3'].map((id, i) => ({ seatId: id, name: id, joinedAt: i }));
const mk = (id: string, seatIds: string[] = []): PoolTask => ({
  id, text: id, authorSeatId: 's1', createdAt: 0, mentions: { seatIds, someone: false, anyone: false },
});

describe('shortfalls', () => {
  it('is empty when every seat has 24 eligible', () => {
    const tasks = [...Array.from({ length: 30 }, (_, i) => mk('p' + i)), ...Array.from({ length: 8 }, (_, i) => mk('m' + i, ['s2']))];
    expect(shortfalls(tasks, seats)).toEqual({});
  });
  it('reports only short seats', () => {
    const tasks = [...Array.from({ length: 23 }, (_, i) => mk('p' + i)), mk('m', ['s2'])];
    expect(shortfalls(tasks, seats)).toEqual({ s2: 1 });
  });
});

describe('dealableCounts', () => {
  const any = (id: string): PoolTask => ({ ...mk(id), mentions: { seatIds: [], someone: false, anyone: true } });
  it('adds floor(anyone / seats) per seat', () => {
    const tasks = [...Array.from({ length: 10 }, (_, i) => mk('p' + i)), mk('m', ['s2']), ...['a1', 'a2', 'a3', 'a4'].map(any)];
    expect(dealableCounts(tasks, seats, { freeSpace: true })).toEqual({ s1: 12, s2: 11, s3: 12 });
  });
});

describe('dealableCounts mixed @anyone', () => {
  it('a mixed @anyone + @Name task adds nothing to the share or any seat', () => {
    const pure = (id: string): PoolTask => ({ ...mk(id), mentions: { seatIds: [], someone: false, anyone: true } });
    const base = [...Array.from({ length: 10 }, (_, i) => mk('p' + i)), pure('a1'), pure('a2')];
    const mixed: PoolTask = { ...mk('x'), mentions: { seatIds: ['s2'], someone: false, anyone: true } };
    const before = dealableCounts(base, seats, { freeSpace: true });
    expect(before).toEqual({ s1: 10, s2: 10, s3: 10 });
    expect(dealableCounts([...base, mixed], seats, { freeSpace: true })).toEqual(before);
    expect(dealableCounts([...base, mixed, pure('a3')], seats, { freeSpace: true })).toEqual({ s1: 11, s2: 11, s3: 11 });
  });
});

describe('shortfalls options', () => {
  const tasks = Array.from({ length: 24 }, (_, i) => mk('p' + i));
  it('needs 25 with freeSpace:false', () => {
    expect(shortfalls(tasks, seats, { freeSpace: false })).toEqual({ s1: 1, s2: 1, s3: 1 });
  });
  it('default call still needs 24', () => {
    expect(shortfalls(tasks, seats)).toEqual({});
    expect(shortfalls(tasks.slice(1), seats)).toEqual({ s1: 1, s2: 1, s3: 1 });
  });
});

describe('readiness guarantees launch (property)', () => {
  it('whenever shortfalls is empty, every seat deals and every @anyone task lands on exactly one board', () => {
    const rng = makeSeededRng(20261030);
    const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
    let readyRuns = 0;
    for (let iter = 0; iter < 200; iter++) {
      const n = int(2, 8);
      const party: Seat[] = Array.from({ length: n }, (_, i) => ({ seatId: 's' + i, name: 'N' + i, joinedAt: i }));
      const tasks: PoolTask[] = [];
      const plainCount = int(0, 40);
      for (let i = 0; i < plainCount; i++) tasks.push(mk('p' + i));
      const anyCount = int(0, 10);
      for (let i = 0; i < anyCount; i++) tasks.push({ ...mk('a' + i), mentions: { seatIds: [], someone: false, anyone: true } });
      const nameCount = int(0, 5);
      for (let i = 0; i < nameCount; i++) tasks.push(mk('n' + i, [party[int(0, n - 1)].seatId]));
      const mixedCount = int(0, 5);
      for (let i = 0; i < mixedCount; i++) {
        tasks.push({ ...mk('x' + i), mentions: { seatIds: [party[int(0, n - 1)].seatId], someone: false, anyone: true } });
      }
      const ghostCount = int(0, 5);
      for (let i = 0; i < ghostCount; i++) {
        tasks.push({ ...mk('u' + i), text: `@Ghost${i} sings`, mentions: { seatIds: [], someone: false, anyone: false, names: ['ghost' + i] } });
      }
      const ghostAnyCount = int(0, 3);
      for (let i = 0; i < ghostAnyCount; i++) {
        tasks.push({ ...mk('ua' + i), text: `@anyone hugs @Ghost${i}`, mentions: { seatIds: [], someone: false, anyone: true, names: ['ghost' + i] } });
      }
      const freeSpace = rng() < 0.5;
      if (Object.keys(shortfalls(tasks, party, { freeSpace })).length > 0) continue;
      readyRuns++;
      const assignment = assignAnyone(tasks, party, rng);
      const boards = party.map((s) => dealBoard(tasks, party, s.seatId, rng, { freeSpace, anyoneAssignment: assignment }));
      const onBoards = (id: string) =>
        boards.filter((b) => b.some((c) => c.kind === 'task' && c.taskId === id)).length;
      for (const t of tasks) {
        if (!t.mentions.anyone) continue;
        const namesEverySeat = party.every((s) => t.mentions.seatIds.includes(s.seatId));
        expect(onBoards(t.id)).toBe(namesEverySeat ? 0 : 1);
      }
    }
    expect(readyRuns).toBeGreaterThan(20);
  });
});

describe('assignAnyone', () => {
  it('assigns every @anyone task to one seat, balanced floor/ceil', () => {
    const tasks: PoolTask[] = [
      ...Array.from({ length: 7 }, (_, i) => ({ ...mk('a' + i), mentions: { seatIds: [], someone: false, anyone: true } })),
      mk('plain'),
    ];
    const a = assignAnyone(tasks, seats, makeSeededRng(5));
    expect(Object.keys(a).sort()).toEqual(['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
    const per = seats.map((s) => Object.values(a).filter((v) => v === s.seatId).length).sort();
    expect(per).toEqual([2, 2, 3]);
  });
  it('is empty without @anyone tasks or seats', () => {
    expect(assignAnyone([mk('p')], seats, makeSeededRng(1))).toEqual({});
    expect(assignAnyone([{ ...mk('a'), mentions: { seatIds: [], someone: false, anyone: true } }], [], makeSeededRng(1))).toEqual({});
  });
});

describe('dealableCounts with names nobody here has yet', () => {
  const ghost = (id: string): PoolTask => ({ ...mk(id), text: `@Ghost ${id}`, mentions: { seatIds: [], someone: false, anyone: false, names: ['ghost'] } });
  it('counts for identified seats only, and for everyone else once that person joins', () => {
    // s2 is named by a task, so identified; s1 and s3 are not.
    const tasks = [...Array.from({ length: 10 }, (_, i) => mk('p' + i)), mk('m', ['s2']), ...['g1', 'g2', 'g3'].map(ghost)];
    expect(dealableCounts(tasks, seats, { freeSpace: true })).toEqual({ s1: 11, s2: 13, s3: 11 });
    const joined: Seat[] = [...seats, { seatId: 's4', name: 'Ghost', joinedAt: 9 }];
    expect(dealableCounts(tasks, joined, { freeSpace: true })).toEqual({ s1: 14, s2: 13, s3: 14, s4: 11 });
  });
  it('a mixed @anyone + unbound name adds nothing to the share', () => {
    const pure = (id: string): PoolTask => ({ ...mk(id), mentions: { seatIds: [], someone: false, anyone: true } });
    const mixed: PoolTask = { ...ghost('x'), mentions: { seatIds: [], someone: false, anyone: true, names: ['ghost'] }, text: '@anyone hugs @Ghost' };
    const base = [...Array.from({ length: 10 }, (_, i) => mk('p' + i)), pure('a1'), pure('a2'), pure('a3')];
    expect(dealableCounts([...base, mixed], seats, { freeSpace: true })).toEqual(dealableCounts(base, seats, { freeSpace: true }));
  });
});
