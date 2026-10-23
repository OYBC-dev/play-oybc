import { dealBoard } from '../src/deal';
import { replaceSomeone } from '../src/mentions';
import { PoolTask, Seat } from '../src/types';
import { makeSeededRng } from './seededRng';

const seats: Seat[] = [
  { seatId: 's1', name: 'Ann', joinedAt: 0 },
  { seatId: 's2', name: 'Bo', joinedAt: 1 },
  { seatId: 's3', name: 'Cy', joinedAt: 2 },
];
const mk = (id: string, text = id, o: Partial<PoolTask['mentions']> = {}): PoolTask => ({
  id, text, authorSeatId: 's3', createdAt: 0, mentions: { seatIds: [], someone: false, anyone: false, ...o },
});
const plain = (n: number) => Array.from({ length: n }, (_, i) => mk('t' + i));

describe('dealBoard', () => {
  it('deals 25 cells with FREE center and 24 distinct tasks, never mentioning the seat', () => {
    const tasks = [...plain(30), ...Array.from({ length: 5 }, (_, i) => mk('m' + i, 'x', { seatIds: ['s1'] }))];
    const b = dealBoard(tasks, seats, 's1', makeSeededRng(42));
    expect(b).toHaveLength(25);
    expect(b[12]).toEqual({ kind: 'free' });
    const ids = b.filter((c) => c.kind === 'task').map((c) => (c as { taskId: string }).taskId);
    expect(new Set(ids).size).toBe(24);
    expect(ids.some((i) => i.startsWith('m'))).toBe(false);
    expect(dealBoard(tasks, seats, 's1', makeSeededRng(42))).toEqual(b);
  });
  it('resolves @someone to another seat, consistently within a task', () => {
    const tasks = [...plain(23), mk('sw', '@someone takes a shot, @Someone drinks', { someone: true })];
    for (let seed = 0; seed < 50; seed++) {
      const b = dealBoard(tasks, seats, 's1', makeSeededRng(seed));
      const cell = b.find((c) => c.kind === 'task' && c.taskId === 'sw') as { text: string };
      expect(cell.text).toMatch(/^(Bo|Cy) takes a shot, \1 drinks$/);
    }
  });
  it('keeps @someone verbatim with a single seat', () => {
    const tasks = [...plain(23), mk('sw', '@someone dances', { someone: true })];
    const b = dealBoard(tasks, [seats[0]], 's1', makeSeededRng(1));
    expect((b.find((c) => c.kind === 'task' && c.taskId === 'sw') as { text: string }).text).toBe('@someone dances');
  });
  it('leaves @anyone unchanged', () => {
    const tasks = [...plain(23), mk('a', '@anyone sings', { anyone: true })];
    const b = dealBoard(tasks, seats, 's1', makeSeededRng(3));
    expect((b.find((c) => c.kind === 'task' && c.taskId === 'a') as { text: string }).text).toBe('@anyone sings');
  });
  it('throws insufficient-pool', () => {
    expect(() => dealBoard(plain(23), seats, 's1')).toThrow('insufficient-pool');
  });
});

describe('replaceSomeone boundaries', () => {
  it('follows parseMentions token rules', () => {
    expect(replaceSomeone('a@someone @someonex @someone-else @someone\'s ok @SOMEONE.', 'Bo'))
      .toBe("a@someone @someonex @someone-else Bo's ok Bo.");
  });
});
