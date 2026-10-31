import { canSeeText, canBeDealt, buildPoolView, mentionContext } from '../src/visibility';
import { PoolTask, Seat, TaskMentions } from '../src/types';

const seat = (seatId: string, name: string): Seat => ({ seatId, name, joinedAt: 0 });
const seats = [seat('s1', 'Jo'), seat('s2', 'Josh'), seat('s3', 'Mary Jane')];
const ctx = (...tasks: PoolTask[]) => mentionContext(tasks, seats);
const task = (id: string, m: Partial<TaskMentions>, createdAt = 0): PoolTask => ({
  id, text: `text-${id}`, authorSeatId: 's1', createdAt,
  mentions: { seatIds: [], someone: false, anyone: false, ...m },
});

describe('visibility', () => {
  it('plain task', () => {
    const t = task('a', {});
    expect(canSeeText(t, 's1', ctx(t))).toBe(true);
    expect(canSeeText(t, 's2', ctx(t))).toBe(true);
    ['s1', 's2', 's3'].forEach((s) => expect(canBeDealt(t, s, ctx(t))).toBe(true));
  });
  it('named mention', () => {
    const t = task('a', { seatIds: ['s2'] });
    expect(canSeeText(t, 's2', ctx(t))).toBe(false);
    expect(canSeeText(t, 's1', ctx(t))).toBe(true);
    expect(canSeeText(t, 's3', ctx(t))).toBe(true);
    expect(canBeDealt(t, 's2', ctx(t))).toBe(false);
    expect(canBeDealt(t, 's3', ctx(t))).toBe(true);
  });
  it('someone / anyone', () => {
    for (const m of [{ someone: true }, { anyone: true }]) {
      const t = task('a', m);
      expect(canSeeText(t, 's1', ctx(t))).toBe(true);
      expect(canSeeText(t, 's2', ctx(t))).toBe(false);
      expect(canSeeText(t, 's3', ctx(t))).toBe(false);
      ['s1', 's2', 's3'].forEach((s) => expect(canBeDealt(t, s, ctx(t))).toBe(true));
    }
  });
  it('named mention plus @someone: only author sees text', () => {
    const t = task('a', { seatIds: ['s2'], someone: true });
    expect(canSeeText(t, 's1', ctx(t))).toBe(true);
    expect(canSeeText(t, 's2', ctx(t))).toBe(false);
    expect(canSeeText(t, 's3', ctx(t))).toBe(false);
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

  describe('a name nobody here has yet', () => {
    const party = [seat('s1', 'Jo'), seat('s2', 'Cody'), seat('s3', 'Seth')];
    const about = (id: string, seatIds: string[] = []): PoolTask => ({ ...task(id, { seatIds }), text: `@Cody and @Jess ${id}` });
    // Cody is named by seat, so identified; Seth is named by nobody.
    const jess: PoolTask = { ...task('j', { names: ['jess'] }), text: '@Jess sings' };
    const cody = about('c', ['s2']);
    const c = mentionContext([jess, cody], party);

    it('is visible to the author and to an identified seat, hidden from an unidentified one; dealt to identified seats only', () => {
      expect(canSeeText(jess, 's1', c)).toBe(true);
      expect(canSeeText(jess, 's2', c)).toBe(true);
      expect(canSeeText(jess, 's3', c)).toBe(false);
      expect(canBeDealt(jess, 's1', c)).toBe(false);
      expect(canBeDealt(jess, 's2', c)).toBe(true);
      expect(canBeDealt(jess, 's3', c)).toBe(false);
    });
    it('once that person joins it is hidden from them and open to everyone else', () => {
      const joined = [...party, seat('s4', 'JESS')];
      const c2 = mentionContext([jess, cody], joined);
      expect(canSeeText(jess, 's4', c2)).toBe(false);
      expect(canBeDealt(jess, 's4', c2)).toBe(false);
      expect(canSeeText(jess, 's3', c2)).toBe(true);
      expect(canBeDealt(jess, 's3', c2)).toBe(true);
    });
    it('a seat named in text written before they joined counts as referenced, whatever seatIds says', () => {
      const early: PoolTask = { ...task('e', {}), text: '@Seth trips' };
      const c3 = mentionContext([early], party);
      expect(canSeeText(early, 's3', c3)).toBe(false);
      expect(canBeDealt(early, 's3', c3)).toBe(false);
      expect(canSeeText(early, 's2', c3)).toBe(true);
    });
    it('a mixed @anyone + unbound name is kept from unidentified seats and read by nobody but the author', () => {
      const mixed: PoolTask = { ...task('m', { anyone: true, names: ['jess'] }), text: '@anyone hugs @Jess' };
      const c4 = mentionContext([mixed, cody], party);
      expect(canSeeText(mixed, 's2', c4)).toBe(false);
      expect(canBeDealt(mixed, 's2', c4)).toBe(true);
      expect(canBeDealt(mixed, 's3', c4)).toBe(false);
    });
    it('buildPoolView shows the typed name bold and hides the row from an unidentified seat', () => {
      const v = buildPoolView([jess, cody], party, 's2');
      expect(v[0]).toMatchObject({ taskId: 'j', text: 'Jess sings', refs: [[0, 4]] });
      expect(buildPoolView([jess, cody], party, 's3')[0].text).toBeNull();
    });
  });
});
