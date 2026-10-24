import { dealBoard } from '../src/deal';
import { replaceSomeone, resolveMentionDisplay } from '../src/mentions';
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
    const tasks = [...plain(23), mk('sw', '@someone sings, @Someone dances', { someone: true })];
    for (let seed = 0; seed < 50; seed++) {
      const b = dealBoard(tasks, seats, 's1', makeSeededRng(seed));
      const cell = b.find((c) => c.kind === 'task' && c.taskId === 'sw') as { text: string };
      expect(cell.text).toMatch(/^(Bo|Cy) sings, \1 dances$/);
    }
  });
  it('keeps @someone verbatim with a single seat', () => {
    const tasks = [...plain(23), mk('sw', '@someone dances', { someone: true })];
    const b = dealBoard(tasks, [seats[0]], 's1', makeSeededRng(1));
    expect((b.find((c) => c.kind === 'task' && c.taskId === 'sw') as { text: string }).text).toBe('@someone dances');
  });
  it('shows @anyone as Anyone', () => {
    const tasks = [...plain(23), mk('a', '@anyone sings', { anyone: true })];
    const b = dealBoard(tasks, seats, 's1', makeSeededRng(3));
    expect((b.find((c) => c.kind === 'task' && c.taskId === 'a') as { text: string }).text).toBe('Anyone sings');
  });
  it('shows @Name as the seat name, with the seat name\'s case', () => {
    const tasks = [...plain(23), mk('n', '@bo trips over @CY', { seatIds: ['s2', 's3'] })];
    const b = dealBoard(tasks, seats, 's1', makeSeededRng(3));
    expect((b.find((c) => c.kind === 'task' && c.taskId === 'n') as { text: string }).text).toBe('Bo trips over Cy');
  });
  it('resolves @someone and @Name in the same text', () => {
    const tasks = [...plain(23), mk('mix', '@someone hugs @cy', { someone: true, seatIds: ['s3'] })];
    for (let seed = 0; seed < 20; seed++) {
      const b = dealBoard(tasks, seats, 's1', makeSeededRng(seed));
      expect((b.find((c) => c.kind === 'task' && c.taskId === 'mix') as { text: string }).text).toMatch(/^(Bo|Cy) hugs Cy$/);
    }
  });
  it('passes an unknown @word through unchanged', () => {
    const tasks = [...plain(23), mk('u', '@Zed waves at @bo')];
    const b = dealBoard(tasks, seats, 's1', makeSeededRng(3));
    expect((b.find((c) => c.kind === 'task' && c.taskId === 'u') as { text: string }).text).toBe('@Zed waves at Bo');
  });
  it('leaves tasks without mentions unchanged', () => {
    const tasks = [...plain(23), mk('p', 'Someone trips, then someone@home sings')];
    const b = dealBoard(tasks, seats, 's1', makeSeededRng(3));
    expect((b.find((c) => c.kind === 'task' && c.taskId === 'p') as { text: string }).text)
      .toBe('Someone trips, then someone@home sings');
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

describe('resolveMentionDisplay', () => {
  const party: Seat[] = [
    { seatId: 'a', name: 'Jo', joinedAt: 0 },
    { seatId: 'b', name: 'Josh', joinedAt: 1 },
    { seatId: 'c', name: 'Mary Ann', joinedAt: 2 },
  ];
  it('takes the longest seat-name match, so Jo never eats @Josh', () => {
    expect(resolveMentionDisplay('@Josh and @jo dance', party, null)).toBe('Josh and Jo dance');
  });
  it('matches multi-word names across whitespace runs and keeps possessives', () => {
    expect(resolveMentionDisplay("@mary   ann's cat sings", party, null)).toBe("Mary Ann's cat sings");
  });
  it('shows @anyone as Anyone and resolves @someone only when given a name', () => {
    expect(resolveMentionDisplay('@ANYONE hugs @someone', party, 'Josh')).toBe('Anyone hugs Josh');
    expect(resolveMentionDisplay('@anyone hugs @someone', party, null)).toBe('Anyone hugs @someone');
  });
  it('keeps unknown mentions, embedded @ and text without mentions verbatim', () => {
    expect(resolveMentionDisplay('@Joshua waves at a@jo', party, null)).toBe('@Joshua waves at a@jo');
    expect(resolveMentionDisplay('Plain text, no tags', party, 'Jo')).toBe('Plain text, no tags');
  });
});
