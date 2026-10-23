import { shortfalls } from '../src/readiness';
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
