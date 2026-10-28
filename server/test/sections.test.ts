import { describe, expect, it } from 'vitest';
import { GameState } from '../src/room/state';
import { MemoryPersistence } from '../src/room/persistence';
import { ALL_SECTIONS, buildSections } from '../src/room/sections';

function fixture(): GameState {
  const s = new GameState(new MemoryPersistence());
  s.putGame({ gameId: 'g', code: 'ABCD', stage: 'lobby', hostSeatId: 'A', createdAt: 1, bingoCount: 0, reviewGate: false, rev: 0, lastMutationAt: 0 });
  for (const [i, id] of ['A', 'B', 'C'].entries()) s.putSeat({ seatId: id, name: id, nameKey: id.toLowerCase(), joinedAt: 10 - i });
  s.putTask({ taskId: 't', text: 'secret', authorSeatId: 'A', mentions: { seatIds: ['B'], someone: false, anyone: false }, createdAt: 1 });
  s.putReclaim({ id: 'r2', requesterUid: 'u', name: 'B', seatId: 'B', status: 'pending', createdAt: 9 });
  s.putReclaim({ id: 'r1', requesterUid: 'u', name: 'C', seatId: 'C', status: 'pending', createdAt: 3 });
  s.putReclaim({ id: 'r3', requesterUid: 'u', name: 'C', seatId: 'C', status: 'denied', createdAt: 1 });
  return s;
}

describe('buildSections', () => {
  it('view hides text from a mentioned seat and shows it to others', () => {
    const s = fixture();
    expect(buildSections(s, 'B', ['view']).view![0].text).toBeNull();
    expect(buildSections(s, 'C', ['view']).view![0].text).toBe('secret');
    expect(buildSections(s, null, ['view']).view).toEqual([]);
  });

  it('reclaims section is empty for a non-host seat', () => {
    const s = fixture();
    expect(buildSections(s, 'B', ['reclaims']).reclaims).toEqual([]);
    expect(buildSections(s, null, ['reclaims']).reclaims).toEqual([]);
    expect(buildSections(s, 'A', ['reclaims']).reclaims!.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('board is null for a seat without a board', () => {
    const s = fixture();
    expect(buildSections(s, 'A', ['board']).board).toBeNull();
    expect(buildSections(s, null, ['board']).board).toBeNull();
  });

  it('game omits rev and lastMutationAt and carries shortfalls; seats sorted by joinedAt', () => {
    const s = fixture();
    const m = buildSections(s, 'A', ALL_SECTIONS);
    expect(m.game).toMatchObject({ code: 'ABCD', hostSeatId: 'A', shortfalls: expect.any(Object) });
    expect(m.game).not.toHaveProperty('rev');
    expect(m.game).not.toHaveProperty('lastMutationAt');
    expect(m.game).not.toHaveProperty('gameId');
    expect(m.seats!.map((x) => x.seatId)).toEqual(['C', 'B', 'A']);
    expect(Object.keys(buildSections(s, 'A', ['seats']))).toEqual(['seats']);
  });

  it('bingos: announced only, by seq; board strips seatId', () => {
    const s = fixture();
    const b = (id: string, seq: number, status: 'announced' | 'pending') =>
      s.appendBingo({ id, seq, seatId: 'A', name: 'A', line: 'r0', playerBingoNumber: 1, at: 1, status });
    b('x', 2, 'announced'); b('y', 1, 'announced'); b('z', 3, 'pending');
    s.putBoard({ seatId: 'A', cells: [], marks: [], completedLines: [], announcedLines: [] });
    const m = buildSections(s, 'A', ['bingos', 'board']);
    expect(m.bingos!.map((x) => x.seq)).toEqual([1, 2]);
    expect(m.board).toEqual({ cells: [], marks: [], completedLines: [], announcedLines: [] });
  });
});
