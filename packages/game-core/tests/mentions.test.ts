import { parseMentions } from '../src/mentions';
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
    expect(parseMentions('trailing @', seats)).toEqual({ ok: false, error: 'unknown-mention', token: '@' });
  });
  it('dedupes', () => {
    const r = parseMentions('@Josh @Josh', seats);
    expect(r.ok && r.mentions.seatIds).toEqual(['s2']);
  });
  it('matches at end of text', () => {
    const r = parseMentions('hi @Jo', seats);
    expect(r.ok && r.mentions.seatIds).toEqual(['s1']);
  });
});
