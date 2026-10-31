import type { RosterName } from 'game-core';
import { activeMention, ADD_ROW_MIN, mentionOptions, type MentionOption } from './mentions';

const names = (rows: MentionOption[]) => rows.map((r) => r.name);

describe('mentions helpers', () => {
  it('finds the partial before the caret', () => {
    expect(activeMention('hi @co', 6)).toEqual({ start: 3, partial: 'co' });
    expect(activeMention('a@co', 4)).toBeNull();
    expect(mentionOptions(activeMention('hi @co there', 12)!.partial, ['Cody'])).toEqual([]);
  });
  it('filters options by prefix and appends someone / anyone', () => {
    expect(names(mentionOptions('', ['Cody', 'Pat']))).toEqual(['Cody', 'Pat', 'someone', 'anyone']);
    expect(names(mentionOptions('an', ['Cody', 'Anna']))).toEqual(['Anna', 'anyone']);
  });
  // game-core's scanner lets the longest match win, so a seat named "Someone Else" is
  // mentionable; the picker must keep offering it ahead of the keyword, and keep the keywords.
  it('offers a seat name longer than a keyword first', () => {
    expect(activeMention('@Someone E', 10)?.partial).toBe('Someone E');
    expect(names(mentionOptions('Someone E', ['Someone Else']))).toEqual(['Someone Else']);
    expect(names(mentionOptions('someone', ['Someone Else', 'Pat']))).toEqual(['Someone Else', 'someone']);
    expect(names(mentionOptions('any', ['Someone Else']))).toEqual(['anyone']);
  });
  it('keeps matching a multi-word name', () => {
    expect(activeMention('hi @Mary J', 10)).toEqual({ start: 3, partial: 'Mary J' });
    expect(names(mentionOptions('Mary J', ['Mary Jane', 'Pat']))).toEqual(['Mary Jane']);
    expect(activeMention('hi @ x', 6)).toBeNull();
  });

  describe('roster rows and the add row', () => {
    const roster: RosterName[] = [
      { key: 'jess', display: 'Jess', seatId: null },
      { key: 'jo', display: 'Jo', seatId: 's2' },
      { key: 'jay', display: 'Jay', seatId: null },
    ];

    it('orders players, bound names, unbound names, keywords, then one add row', () => {
      expect(mentionOptions('', ['Jamie', 'Pat'], roster)).toEqual([
        { name: 'Jamie', kind: 'player' },
        { name: 'Pat', kind: 'player' },
        { name: 'Jo', kind: 'bound', seatId: 's2' },
        { name: 'Jess', kind: 'unbound' },
        { name: 'Jay', kind: 'unbound' },
        { name: 'someone', kind: 'keyword' },
        { name: 'anyone', kind: 'keyword' },
      ]);
      expect(mentionOptions('J', ['Jamie', 'Pat'], roster)).toEqual([
        { name: 'Jamie', kind: 'player' },
        { name: 'Jo', kind: 'bound', seatId: 's2' },
        { name: 'Jess', kind: 'unbound' },
        { name: 'Jay', kind: 'unbound' },
      ]);
    });

    it('offers the add row from 2 characters, never for one', () => {
      expect(ADD_ROW_MIN).toBe(2);
      expect(mentionOptions('K', ['Pat'], roster)).toEqual([]);
      expect(mentionOptions('Kr', ['Pat'], roster)).toEqual([{ name: 'Kr', kind: 'add' }]);
      // One character still lists what it matches, just no add row.
      expect(mentionOptions('J', [], roster).map((r) => r.kind)).toEqual(['bound', 'unbound', 'unbound']);
    });

    it('never offers a name bound to yourself (a self-mention), but still never re-adds it', () => {
      const ctx = { selfSeatId: 's2', seatIds: new Set(['s1', 's2']) };
      expect(names(mentionOptions('', ['Pat'], roster, ['Pat', 'Me'], ctx))).toEqual(['Pat', 'Jess', 'Jay', 'someone', 'anyone']);
      expect(mentionOptions('Jo', ['Pat'], roster, ['Pat', 'Me'], ctx)).toEqual([]);
    });

    it('treats a name bound to a seat no longer here as unbound', () => {
      expect(mentionOptions('Jo', ['Pat'], roster, ['Pat'], { seatIds: new Set(['s1']) })).toEqual([{ name: 'Jo', kind: 'unbound' }]);
    });

    it('prefix-matches through nameKey folding (case and curly apostrophes)', () => {
      expect(names(mentionOptions('o’n', ["O'Neil", 'Pat']))).toEqual(["O'Neil"]);
      expect(names(mentionOptions("o'n", ['O’Neil']))).toEqual(['O’Neil']);
      // A finished mention ("@Cody ") does not reopen on the same name.
      expect(mentionOptions('Cody ', ['Cody'])).toEqual([]);
    });

    it('adds a valid new name only when nothing matches it exactly', () => {
      expect(mentionOptions('Kim', ['Pat'], roster)).toEqual([{ name: 'Kim', kind: 'add' }]);
      expect(mentionOptions('Je', ['Pat'], roster)).toEqual([{ name: 'Jess', kind: 'unbound' }, { name: 'Je', kind: 'add' }]);
      expect(mentionOptions('jess', ['Pat'], roster)).toEqual([{ name: 'Jess', kind: 'unbound' }]);
      expect(mentionOptions('JO', ['Pat'], roster)).toEqual([{ name: 'Jo', kind: 'bound', seatId: 's2' }]);
      expect(mentionOptions('pat', ['Pat'], roster)).toEqual([{ name: 'Pat', kind: 'player' }]);
    });

    it('never adds a keyword, an invalid name, a name being typed past a space, or someone here', () => {
      expect(mentionOptions('someone', [], roster)).toEqual([{ name: 'someone', kind: 'keyword' }]);
      expect(mentionOptions('anyone', [], roster)).toEqual([{ name: 'anyone', kind: 'keyword' }]);
      expect(mentionOptions('so', [], roster)).toEqual([{ name: 'someone', kind: 'keyword' }]);
      expect(mentionOptions('Kim!', [], roster)).toEqual([]);
      expect(mentionOptions('Kim ', [], roster)).toEqual([]);
      expect(mentionOptions('Kim sings', [], roster)).toEqual([]);
      // Your own name, and a near name of someone here ("Cody" with "Cody B"), are refused by the server.
      expect(mentionOptions('Me', ['Pat'], roster, ['Pat', 'Me'])).toEqual([]);
      expect(mentionOptions('Cody', ['Cody B'], roster)).toEqual([{ name: 'Cody B', kind: 'player' }]);
      expect(mentionOptions('Codys', ['Cody B'], roster)).toEqual([]);
    });
  });
});

describe('name rules (restated from game-core)', () => {
  it('match game-core on the cases the picker relies on', async () => {
    const core = await import('../../../../packages/game-core/src/names');
    const local = await import('./mentions');
    for (const raw of ['Jess', ' Mary  Jane ', 'someone', 'Anyone', 'Kim!', '', 'a'.repeat(21), "O’Neil", 'Jo-Ann']) {
      expect(local.normalizeName(raw)).toBe(core.normalizeName(raw));
      expect(local.nameKey(raw)).toBe(core.nameKey(raw));
    }
    for (const [k, seat] of [['cody', 'cody b'], ['codys', 'cody b'], ['cod', 'cody b'], ['co', 'cody b'], ['samantha', 'sam'], ['jess', 'jessie']]) {
      expect(local.isNearName(k, seat)).toBe(core.isNearName(k, seat));
    }
  });
});
