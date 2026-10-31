import { describe, expect, it } from 'vitest';
import { GameState } from '../src/room/state';
import { MemoryPersistence } from '../src/room/persistence';
import { ALL_SECTIONS, buildSections } from '../src/room/sections';

function fixture(): GameState {
  const s = new GameState(new MemoryPersistence());
  s.putGame({ gameId: 'g', code: 'ABCD', stage: 'lobby', hostSeatId: 'A', createdAt: 1, bingoCount: 0, reviewGate: false, freeSpace: false, rev: 0, lastMutationAt: 0 });
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

  it('game carries tasksPerBoard for the free-space option and dealable for every seat', () => {
    const s = fixture();
    const off = buildSections(s, 'A', ['game']).game!;
    expect(off).toMatchObject({ freeSpace: false, tasksPerBoard: 25 });
    // 't' names B, so it is dealable to A and C only.
    expect(off.dealable).toEqual({ A: 1, B: 0, C: 1 });
    expect(off.shortfalls).toEqual({ A: 24, B: 25, C: 24 });
    s.putGame({ ...s.game!, freeSpace: true });
    const on = buildSections(s, 'A', ['game']).game!;
    expect(on).toMatchObject({ freeSpace: true, tasksPerBoard: 24 });
    expect(on.shortfalls).toEqual({ A: 23, B: 24, C: 23 });
  });

  it('view entries carry display text and mention refs', () => {
    const s = fixture();
    s.putTask({ taskId: 'u', text: '@B and @someone dance', authorSeatId: 'A', mentions: { seatIds: ['B'], someone: true, anyone: false }, createdAt: 2 });
    s.putTask({ taskId: 'v', text: '@anyone sings', authorSeatId: 'C', mentions: { seatIds: [], someone: false, anyone: true }, createdAt: 3 });
    const a = buildSections(s, 'A', ['view']).view!;
    expect(a.find((e) => e.taskId === 'u')).toMatchObject({ text: 'B and Someone dance', refs: [[0, 1], [6, 13]] });
    expect(a.find((e) => e.taskId === 'v')).toMatchObject({ text: null });
    expect(buildSections(s, 'C', ['view']).view!.find((e) => e.taskId === 'v')).toMatchObject({ text: 'Anyone sings', refs: [[0, 6]] });
    expect(a.find((e) => e.taskId === 't')).not.toHaveProperty('refs');
  });

  it('standings is empty in the lobby', () => {
    const s = fixture();
    expect(buildSections(s, 'A', ['standings']).standings).toEqual([]);
    expect(buildSections(s, null, ALL_SECTIONS).standings).toEqual([]);
  });

  it('standings takes each seat\'s lowest announced bingo seq', () => {
    const s = fixture();
    const marks = Array<boolean>(25).fill(false);
    for (const id of ['A', 'B']) s.putBoard({ seatId: id, cells: [], marks, completedLines: [], announcedLines: id === 'B' ? ['row_0', 'row_1'] : [] });
    s.appendBingo({ id: 'p', seq: 1, seatId: 'B', name: 'B', line: 'row_9', playerBingoNumber: 1, at: 1, status: 'pending' });
    s.appendBingo({ id: 'y', seq: 5, seatId: 'B', name: 'B', line: 'row_1', playerBingoNumber: 2, at: 1, status: 'announced' });
    s.appendBingo({ id: 'x', seq: 3, seatId: 'B', name: 'B', line: 'row_0', playerBingoNumber: 1, at: 1, status: 'announced' });
    const rows = buildSections(s, 'A', ['standings']).standings!;
    expect(rows.map((r) => [r.seatId, r.bingos, r.firstBingoSeq])).toEqual([['B', 2, 3], ['A', 0, null]]);
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
