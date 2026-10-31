import { canSeeText, canBeDealt, buildPoolView } from '../src/visibility';
import { PoolTask, Seat, TaskMentions } from '../src/types';

const seat = (seatId: string, name: string): Seat => ({ seatId, name, joinedAt: 0 });
const seats = [seat('s1', 'Jo'), seat('s2', 'Josh'), seat('s3', 'Mary Jane')];
const task = (id: string, m: Partial<TaskMentions>, createdAt = 0): PoolTask => ({
  id, text: `text-${id}`, authorSeatId: 's1', createdAt,
  mentions: { seatIds: [], someone: false, anyone: false, ...m },
});

describe('visibility', () => {
  it('plain task', () => {
    const t = task('a', {});
    expect(canSeeText(t, 's1')).toBe(true);
    expect(canSeeText(t, 's2')).toBe(true);
    ['s1', 's2', 's3'].forEach((s) => expect(canBeDealt(t, s)).toBe(true));
  });
  it('named mention', () => {
    const t = task('a', { seatIds: ['s2'] });
    expect(canSeeText(t, 's2')).toBe(false);
    expect(canSeeText(t, 's1')).toBe(true);
    expect(canSeeText(t, 's3')).toBe(true);
    expect(canBeDealt(t, 's2')).toBe(false);
    expect(canBeDealt(t, 's3')).toBe(true);
  });
  it('someone / anyone', () => {
    for (const m of [{ someone: true }, { anyone: true }]) {
      const t = task('a', m);
      expect(canSeeText(t, 's1')).toBe(true);
      expect(canSeeText(t, 's2')).toBe(false);
      expect(canSeeText(t, 's3')).toBe(false);
      ['s1', 's2', 's3'].forEach((s) => expect(canBeDealt(t, s)).toBe(true));
    }
  });
  it('named mention plus @someone: only author sees text', () => {
    const t = task('a', { seatIds: ['s2'], someone: true });
    expect(canSeeText(t, 's1')).toBe(true);
    expect(canSeeText(t, 's2')).toBe(false);
    expect(canSeeText(t, 's3')).toBe(false);
  });
  it('buildPoolView hides, flags mine, sorts, names authors', () => {
    const tasks = [task('late', {}, 5), task('hid', { seatIds: ['s2'] }, 1)];
    const v = buildPoolView(tasks, seats, 's2');
    expect(v.map((e) => e.taskId)).toEqual(['hid', 'late']);
    expect(v[0]).toEqual({ taskId: 'hid', authorName: 'Jo', text: null, mine: false });
    expect(v[1].text).toBe('text-late');
    expect(buildPoolView(tasks, seats, 's1')[0]).toMatchObject({ mine: true, text: 'text-hid' });
  });
  it('unknown author name falls back to empty string', () => {
    const t = { ...task('a', {}), authorSeatId: 'gone' };
    expect(buildPoolView([t], seats, 's2')[0].authorName).toBe('');
  });
  it('buildPoolView shows display text with refs for visible entries', () => {
    const party = [seat('s1', 'Jo'), seat('s2', 'Cody')];
    const named: PoolTask = { ...task('n', { seatIds: ['s2'] }), text: '@cody does X' };
    const some: PoolTask = { ...task('s', { someone: true }, 1), text: '@someone sings' };
    const any: PoolTask = { ...task('a', { anyone: true }, 2), text: 'hug @anyone' };
    const v = buildPoolView([named, some, any], party, 's1');
    expect(v[0]).toEqual({ taskId: 'n', authorName: 'Jo', text: 'Cody does X', refs: [[0, 4]], mine: true });
    expect(v[1]).toMatchObject({ text: 'Someone sings', refs: [[0, 7]] });
    expect(v[2]).toMatchObject({ text: 'hug Anyone', refs: [[4, 10]] });
    const hidden = buildPoolView([named], party, 's2')[0];
    expect(hidden.text).toBeNull();
    expect(hidden.refs).toBeUndefined();
  });
});
