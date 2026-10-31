import { parseMentions, resolveMentionRefs } from '../src/mentions';
import { Seat } from '../src/types';

const seat = (seatId: string, name: string): Seat => ({ seatId, name, joinedAt: 0 });
const seats = [seat('s1', 'Jo'), seat('s2', 'Josh'), seat('s3', 'Mary Jane')];
const none = { seatIds: [], someone: false, anyone: false };

describe('parseMentions', () => {
  it('matches longest name', () => {
    expect(parseMentions('@Josh naps', seats)).toEqual({ ok: true, mentions: { seatIds: ['s2'], someone: false, anyone: false } });
  });
  it('is case-insensitive, multi-word, ordered', () => {
    const r = parseMentions('@jo and @MARY JANE dance', seats);
    expect(r.ok && r.mentions.seatIds).toEqual(['s1', 's3']);
  });
  it('keywords', () => {
    const a = parseMentions('@someone takes a shot', seats);
    expect(a.ok && a.mentions).toEqual({ seatIds: [], someone: true, anyone: false });
    const b = parseMentions('@Anyone leaves', seats);
    expect(b.ok && b.mentions.anyone).toBe(true);
  });
  it('ignores @ inside words', () => {
    expect(parseMentions('mail a@b.com', seats)).toEqual({ ok: true, mentions: none });
  });
  it('unknown mention', () => {
    expect(parseMentions('@Bob sings', seats)).toEqual({ ok: false, error: 'unknown-mention', token: '@Bob' });
    expect(parseMentions('@Joshua', seats)).toEqual({ ok: false, error: 'unknown-mention', token: '@Joshua' });
    expect(parseMentions('@someoneelse', seats)).toEqual({ ok: false, error: 'unknown-mention', token: '@someoneelse' });
    expect(parseMentions('@Jo-Ann', seats)).toEqual({ ok: false, error: 'unknown-mention', token: '@Jo-Ann' });
  });
  it('dedupes', () => {
    const r = parseMentions('@Josh @Josh', seats);
    expect(r.ok && r.mentions.seatIds).toEqual(['s2']);
  });
  it('matches at end of text', () => {
    const r = parseMentions('hi @Jo', seats);
    expect(r.ok && r.mentions.seatIds).toEqual(['s1']);
  });
  it('lone @ is plain text', () => {
    expect(parseMentions('meet @ 5pm', seats)).toEqual({ ok: true, mentions: none });
    expect(parseMentions('trailing @', seats)).toEqual({ ok: true, mentions: none });
  });
  it('tolerates odd whitespace inside multi-word names', () => {
    const r = parseMentions('@Mary  Jane dances', seats);
    expect(r.ok && r.mentions.seatIds).toEqual(['s3']);
    const t = parseMentions('@mary\tjane', seats);
    expect(t.ok && t.mentions.seatIds).toEqual(['s3']);
  });
  it('hyphen/apostrophe continuations', () => {
    const p = parseMentions("@Josh's turn", seats);
    expect(p.ok && p.mentions.seatIds).toEqual(['s2']);
    const q = parseMentions('@Josh’s turn', seats);
    expect(q.ok && q.mentions.seatIds).toEqual(['s2']);
    const both = [seat('a', 'Jo'), seat('b', 'Jo-Ann')];
    const r = parseMentions('@Jo-Ann waves', both);
    expect(r.ok && r.mentions.seatIds).toEqual(['b']);
    const h = parseMentions('@Jo- waves', both);
    expect(h.ok && h.mentions.seatIds).toEqual(['a']);
    expect(parseMentions("@Josh'x", seats).ok).toBe(false);
  });
  it('longest match wins over keywords', () => {
    const party = [seat('e', 'Someone Else'), seat('n', 'Anyone Here')];
    const a = parseMentions('@Someone Else dances', party);
    expect(a).toEqual({ ok: true, mentions: { seatIds: ['e'], someone: false, anyone: false } });
    const b = parseMentions('@someone dances', party);
    expect(b).toEqual({ ok: true, mentions: { seatIds: [], someone: true, anyone: false } });
    const c = parseMentions('@anyone dances', party);
    expect(c).toEqual({ ok: true, mentions: { seatIds: [], someone: false, anyone: true } });
    const d = parseMentions('@anyone here', party);
    expect(d.ok && d.mentions.seatIds).toEqual(['n']);
    // A seat named exactly like a keyword ties on length: the keyword wins.
    const tie = parseMentions('@someone', [seat('k', 'Someone')]);
    expect(tie.ok && tie.mentions).toEqual({ seatIds: [], someone: true, anyone: false });
  });
  it('punctuation boundaries', () => {
    const a = parseMentions('hey @Josh, go', seats);
    expect(a.ok && a.mentions.seatIds).toEqual(['s2']);
    const b = parseMentions('(@Jo)', seats);
    expect(b.ok && b.mentions.seatIds).toEqual(['s1']);
    const c = parseMentions('@someone.', seats);
    expect(c.ok && c.mentions.someone).toBe(true);
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
  it('an unknown @word stays verbatim with no ref', () => {
    expect(resolveMentionRefs('@Zed waves at @jo', party, null)).toEqual({ text: '@Zed waves at Jo', refs: [[14, 16]] });
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
