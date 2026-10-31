import { nearMissMentions, parseMentions, resolveMentionRefs } from '../src/mentions';
import { Seat } from '../src/types';

const seat = (seatId: string, name: string): Seat => ({ seatId, name, joinedAt: 0 });
const seats = [seat('s1', 'Jo'), seat('s2', 'Josh'), seat('s3', 'Mary Jane')];
const none = { seatIds: [], someone: false, anyone: false };

describe('parseMentions', () => {
  it('matches longest name', () => {
    expect(parseMentions('@Josh naps', seats)).toEqual({ seatIds: ['s2'], someone: false, anyone: false });
  });
  it('is case-insensitive, multi-word, ordered', () => {
    const r = parseMentions('@jo and @MARY JANE dance', seats);
    expect(r.seatIds).toEqual(['s1', 's3']);
  });
  it('keywords', () => {
    const a = parseMentions('@someone takes a shot', seats);
    expect(a).toEqual({ seatIds: [], someone: true, anyone: false });
    const b = parseMentions('@Anyone leaves', seats);
    expect(b.anyone).toBe(true);
  });
  it('ignores @ inside words', () => {
    expect(parseMentions('mail a@b.com', seats)).toEqual(none);
  });
  it('a name nobody here has yet becomes an unbound name key', () => {
    expect(parseMentions('@Bob sings', seats)).toEqual({ ...none, names: ['bob'] });
    expect(parseMentions('@Joshua', seats)).toEqual({ ...none, names: ['joshua'] });
    expect(parseMentions('@someoneelse', seats)).toEqual({ ...none, names: ['someoneelse'] });
    expect(parseMentions('@Jo-Ann', seats)).toEqual({ ...none, names: ['jo-ann'] });
  });
  it('unbound names dedupe by key, keep text order, and sit beside seat mentions', () => {
    expect(parseMentions('@Bob and @BOB and @Zed', seats).names).toEqual(['bob', 'zed']);
    expect(parseMentions('@Bob hugs @Josh', seats)).toEqual({ ...none, seatIds: ['s2'], names: ['bob'] });
  });
  it("an unbound name stops before a possessive and a trailing joiner", () => {
    expect(parseMentions("@Zed's hat", seats).names).toEqual(['zed']);
    expect(parseMentions('@Zed’s hat', seats).names).toEqual(['zed']);
    expect(parseMentions('@Zed- hat', seats).names).toEqual(['zed']);
    expect(parseMentions("@O'Neil waves", seats).names).toEqual(["o'neil"]);
  });
  it('a curly apostrophe still matches the seat, and a whole-word fold matches a final sigma', () => {
    const party = [seat('o', "O'Neil"), seat('g', 'ΟΔΥΣΣΕΑΣ')];
    expect(parseMentions('@O’Neil waves', party)).toEqual({ ...none, seatIds: ['o'] });
    expect(parseMentions("@o'neil waves", party)).toEqual({ ...none, seatIds: ['o'] });
    expect(parseMentions('@οδυσσεας dances', party)).toEqual({ ...none, seatIds: ['g'] });
    expect(parseMentions('@ΟΔΥΣΣΕΑΣ dances', party)).toEqual({ ...none, seatIds: ['g'] });
  });
  it('nearMissMentions: an unknown token that nearly names someone here', () => {
    const party = [seat('c', 'Cody B'), seat('m', 'Mary Jane')];
    expect(nearMissMentions('@Cody streaks', party)).toEqual(['@Cody']);
    expect(nearMissMentions('@Mary sings with @Codys', party)).toEqual(['@Mary', '@Codys']);
    expect(nearMissMentions('@Jess sings', party)).toEqual([]);
    expect(nearMissMentions('@Cody B streaks', party)).toEqual([]);
  });
  it('a typed multi-word name binds only its first word until that seat exists', () => {
    expect(parseMentions('@Jess Smith sings', seats).names).toEqual(['jess']);
    const withJess = [...seats, seat('s4', 'Jess Smith')];
    expect(parseMentions('@Jess Smith sings', withJess)).toEqual({ ...none, seatIds: ['s4'] });
  });
  it('dedupes', () => {
    const r = parseMentions('@Josh @Josh', seats);
    expect(r.seatIds).toEqual(['s2']);
  });
  it('matches at end of text', () => {
    const r = parseMentions('hi @Jo', seats);
    expect(r.seatIds).toEqual(['s1']);
  });
  it('lone @ is plain text', () => {
    expect(parseMentions('meet @ 5pm', seats)).toEqual(none);
    expect(parseMentions('trailing @', seats)).toEqual(none);
  });
  it('tolerates odd whitespace inside multi-word names', () => {
    const r = parseMentions('@Mary  Jane dances', seats);
    expect(r.seatIds).toEqual(['s3']);
    const t = parseMentions('@mary\tjane', seats);
    expect(t.seatIds).toEqual(['s3']);
  });
  it('hyphen/apostrophe continuations', () => {
    const p = parseMentions("@Josh's turn", seats);
    expect(p.seatIds).toEqual(['s2']);
    const q = parseMentions('@Josh’s turn', seats);
    expect(q.seatIds).toEqual(['s2']);
    const both = [seat('a', 'Jo'), seat('b', 'Jo-Ann')];
    const r = parseMentions('@Jo-Ann waves', both);
    expect(r.seatIds).toEqual(['b']);
    const h = parseMentions('@Jo- waves', both);
    expect(h.seatIds).toEqual(['a']);
    expect(parseMentions("@Josh'x", seats)).toEqual({ ...none, names: ["josh'x"] });
  });
  it('longest match wins over keywords', () => {
    const party = [seat('e', 'Someone Else'), seat('n', 'Anyone Here')];
    const a = parseMentions('@Someone Else dances', party);
    expect(a).toEqual({ seatIds: ['e'], someone: false, anyone: false });
    const b = parseMentions('@someone dances', party);
    expect(b).toEqual({ seatIds: [], someone: true, anyone: false });
    const c = parseMentions('@anyone dances', party);
    expect(c).toEqual({ seatIds: [], someone: false, anyone: true });
    const d = parseMentions('@anyone here', party);
    expect(d.seatIds).toEqual(['n']);
    // A seat named exactly like a keyword ties on length: the keyword wins.
    const tie = parseMentions('@someone', [seat('k', 'Someone')]);
    expect(tie).toEqual({ seatIds: [], someone: true, anyone: false });
  });
  it('punctuation boundaries', () => {
    const a = parseMentions('hey @Josh, go', seats);
    expect(a.seatIds).toEqual(['s2']);
    const b = parseMentions('(@Jo)', seats);
    expect(b.seatIds).toEqual(['s1']);
    const c = parseMentions('@someone.', seats);
    expect(c.someone).toBe(true);
  });
});

describe('resolveMentionRefs', () => {
  const party = [seat('s1', 'Jo'), seat('s2', 'Cody'), seat('s3', 'Mary Jane')];
  it('@Name', () => {
    expect(resolveMentionRefs('@cody does X', party, null)).toEqual({ text: 'Cody does X', refs: [[0, 4]] });
  });
  it('@someone with a given name', () => {
    expect(resolveMentionRefs('hug @someone now', party, 'Jo')).toEqual({ text: 'hug Jo now', refs: [[4, 6]] });
  });
  it('@someone without a name stays verbatim, no ref', () => {
    expect(resolveMentionRefs('hug @someone', party, null)).toEqual({ text: 'hug @someone', refs: [] });
  });
  it('@anyone', () => {
    expect(resolveMentionRefs('@ANYONE sings', party, null)).toEqual({ text: 'Anyone sings', refs: [[0, 6]] });
  });
  it('two mentions', () => {
    expect(resolveMentionRefs('@jo hugs @cody', party, null)).toEqual({ text: 'Jo hugs Cody', refs: [[0, 2], [8, 12]] });
  });
  it('a name nobody here has yet shows without its @, with a ref', () => {
    expect(resolveMentionRefs('@Zed waves at @jo', party, null)).toEqual({ text: 'Zed waves at Jo', refs: [[0, 3], [13, 15]] });
    expect(resolveMentionRefs("@Zed's hat", party, null)).toEqual({ text: "Zed's hat", refs: [[0, 3]] });
  });
  it('the same text resolves to the seat name once that person joins', () => {
    const joined = [...party, seat('s4', 'zed')];
    expect(resolveMentionRefs('@Zed waves', joined, null)).toEqual({ text: 'zed waves', refs: [[0, 3]] });
  });
  it('a name containing a space', () => {
    expect(resolveMentionRefs("@mary   jane's cat", party, null)).toEqual({ text: "Mary Jane's cat", refs: [[0, 9]] });
  });
  it('offsets are UTF-16 code units of the resolved text', () => {
    const r = resolveMentionRefs('🎉 @jo', party, null);
    expect(r).toEqual({ text: '🎉 Jo', refs: [[3, 5]] });
    expect(r.text.slice(3, 5)).toBe('Jo');
  });
});
