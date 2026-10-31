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
  it('a seat name longer than a keyword wins the display, the bare keyword still resolves', () => {
    const withElse: Seat[] = [...party, { seatId: 'd', name: 'Someone Else', joinedAt: 3 }];
    expect(resolveMentionDisplay('@someone else and @someone wave', withElse, 'Jo')).toBe('Someone Else and Jo wave');
  });
  it('keeps unknown mentions, embedded @ and text without mentions verbatim', () => {
    expect(resolveMentionDisplay('@Joshua waves at a@jo', party, null)).toBe('@Joshua waves at a@jo');
    expect(resolveMentionDisplay('Plain text, no tags', party, 'Jo')).toBe('Plain text, no tags');
  });
});

describe('dealBoard options', () => {
  const cody: Seat[] = [
    { seatId: 's1', name: 'Ann', joinedAt: 0 },
    { seatId: 's2', name: 'Bo', joinedAt: 1 },
    { seatId: 's3', name: 'Cody', joinedAt: 2 },
  ];
  const ids = (b: ReturnType<typeof dealBoard>) =>
    b.filter((c) => c.kind === 'task').map((c) => (c as { taskId: string }).taskId);

  it('freeSpace:false deals 25 task cells and no free cell', () => {
    const b = dealBoard(plain(30), seats, 's1', makeSeededRng(7), { freeSpace: false });
    expect(b).toHaveLength(25);
    expect(b.some((c) => c.kind === 'free')).toBe(false);
    expect(new Set(ids(b)).size).toBe(25);
  });
  it('freeSpace:false throws insufficient-pool at 24 eligible', () => {
    expect(() => dealBoard(plain(24), seats, 's1', makeSeededRng(7), { freeSpace: false })).toThrow('insufficient-pool');
  });
  it('an @anyone task assigned to s2 never lands on s1', () => {
    const tasks = [...plain(24), mk('any', '@anyone sings', { anyone: true })];
    for (let seed = 0; seed < 30; seed++) {
      const s1 = dealBoard(tasks, seats, 's1', makeSeededRng(seed), { freeSpace: true, anyoneAssignment: { any: 's2' } });
      expect(ids(s1)).not.toContain('any');
    }
    const s2 = dealBoard(tasks, seats, 's2', makeSeededRng(1), { freeSpace: false, anyoneAssignment: { any: 's2' } });
    expect(ids(s2)).toContain('any');
  });
  it('an @anyone task not in the assignment stays eligible for everyone', () => {
    const tasks = [...plain(23), mk('any', '@anyone sings', { anyone: true })];
    const b = dealBoard(tasks, seats, 's1', makeSeededRng(1), { freeSpace: true, anyoneAssignment: {} });
    expect(ids(b)).toContain('any');
  });
  it('deals every @anyone task assigned to the seat, even from a large pool', () => {
    const anyone = Array.from({ length: 4 }, (_, i) => mk('any' + i, '@anyone sings', { anyone: true }));
    const tasks = [...plain(60), ...anyone];
    const assignment = { any0: 's1', any1: 's1', any2: 's2', any3: 's3' };
    for (let seed = 0; seed < 30; seed++) {
      const b = ids(dealBoard(tasks, seats, 's1', makeSeededRng(seed), { freeSpace: false, anyoneAssignment: assignment }));
      expect(b).toHaveLength(25);
      expect(b).toEqual(expect.arrayContaining(['any0', 'any1']));
      expect(b).not.toContain('any2');
      expect(b).not.toContain('any3');
    }
  });
  it('a seat assigned more than a board of @anyone tasks gets a board of them and no plain task', () => {
    const anyone = Array.from({ length: 30 }, (_, i) => mk('any' + i, '@anyone sings', { anyone: true }));
    const assignment = Object.fromEntries(anyone.map((t) => [t.id, 's1']));
    const b = ids(dealBoard([...plain(40), ...anyone], seats, 's1', makeSeededRng(3), { freeSpace: true, anyoneAssignment: assignment }));
    expect(b).toHaveLength(24);
    expect(new Set(b).size).toBe(24);
    expect(b.every((i) => i.startsWith('any'))).toBe(true);
  });
  it('a mixed @anyone + @Name task assigned to the seat is dealt first too', () => {
    const mixed = mk('mx', '@anyone hugs @Bo', { anyone: true, seatIds: ['s2'] });
    for (let seed = 0; seed < 20; seed++) {
      const b = dealBoard([...plain(60), mixed], seats, 's1', makeSeededRng(seed), { freeSpace: true, anyoneAssignment: { mx: 's1' } });
      expect(ids(b)).toContain('mx');
    }
  });
  it('never deals excludeTaskIds', () => {
    const excluded = new Set(['t0', 't1', 't2', 't3', 't4']);
    const b = dealBoard(plain(30), seats, 's1', makeSeededRng(9), { freeSpace: false, excludeTaskIds: excluded });
    expect(ids(b).some((i) => excluded.has(i))).toBe(false);
    expect(() => dealBoard(plain(29), seats, 's1', makeSeededRng(9), { freeSpace: false, excludeTaskIds: excluded }))
      .toThrow('insufficient-pool');
  });
  it('fills refs for a mention and leaves plain tasks without refs', () => {
    const tasks = [...plain(23), mk('c', '@Cody does X', { seatIds: ['s3'] })];
    const b = dealBoard(tasks, cody, 's1', makeSeededRng(2));
    const cell = b.find((c) => c.kind === 'task' && c.taskId === 'c');
    expect(cell).toEqual({ kind: 'task', taskId: 'c', text: 'Cody does X', refs: [[0, 4]] });
    const p = b.find((c) => c.kind === 'task' && c.taskId === 't0') as { refs?: unknown[] };
    expect(p.refs ?? []).toEqual([]);
  });
});
