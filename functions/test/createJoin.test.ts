import { beforeEach, describe, expect, it } from 'vitest';
import { admin, appCodeOf, callAs, clearFirestore, readAdmin, uidOf } from './helpers';

beforeEach(clearFirestore);

async function newGame() {
  return callAs('u1', 'createGame', { name: 'Stephen' });
}

describe('createGame', () => {
  it('creates game, code, seat, member and empty view', async () => {
    const { gameId, code, seatId } = await newGame();
    expect((await readAdmin(`codes/${code}`)).gameId).toBe(gameId);
    const game = await readAdmin(`games/${gameId}`);
    expect(game).toMatchObject({ stage: 'lobby', hostSeatId: seatId, bingoCount: 0, code });
    expect((await readAdmin(`games/${gameId}/members/${await uidOf('u1')}`)).seatId).toBe(seatId);
    expect((await readAdmin(`games/${gameId}/views/${seatId}`)).entries).toEqual([]);
  });
  it('rejects an invalid name', async () => {
    expect(await appCodeOf(callAs('u1', 'createGame', { name: '' }))).toBe('invalid-name');
  });
});

describe('joinGame', () => {
  it('joins, then resumes on a second call without a new seat', async () => {
    const { gameId, code } = await newGame();
    const j = await callAs('u2', 'joinGame', { code, name: 'Cody' });
    expect(j.status).toBe('joined');
    expect(await readAdmin(`games/${gameId}/views/${j.seatId}`)).toBeTruthy();
    const again = await callAs('u2', 'joinGame', { code, name: 'Whoever' });
    expect(again).toMatchObject({ status: 'resumed', seatId: j.seatId });
    expect((await admin.collection(`games/${gameId}/seats`).get()).size).toBe(2);
  });
  it('creates a reclaim request on a name clash', async () => {
    const { gameId, code } = await newGame();
    const cody = await callAs('u2', 'joinGame', { code, name: 'Cody' });
    const r = await callAs('u3', 'joinGame', { code, name: ' cody ' });
    expect(r.status).toBe('reclaim-pending');
    expect(await readAdmin(`games/${gameId}/reclaims/${r.reclaimId}`)).toMatchObject({
      requesterUid: await uidOf('u3'), seatId: cody.seatId, status: 'pending',
    });
    expect((await admin.collection(`games/${gameId}/seats`).get()).size).toBe(2);
  });
  it('accepts a lowercase code; unknown code and empty name fail', async () => {
    const { code } = await newGame();
    expect((await callAs('u2', 'joinGame', { code: code.toLowerCase(), name: 'Cody' })).status).toBe('joined');
    expect(await appCodeOf(callAs('u3', 'joinGame', { code: 'ZZZZZ', name: 'X' }))).toBe('game-not-found');
    expect(await appCodeOf(callAs('u3', 'joinGame', { code, name: '' }))).toBe('invalid-name');
  });
  it('deals a 25-cell board when joining a playing game', async () => {
    const { gameId, code, seatId } = await newGame();
    for (let i = 0; i < 30; i++) {
      await admin.doc(`games/${gameId}/tasks/t${i}`).set({
        text: `task ${i}`, authorSeatId: seatId, mentions: { seatIds: [], someone: false, anyone: false }, createdAt: i,
      });
    }
    await admin.doc(`games/${gameId}`).update({ stage: 'playing' });
    const j = await callAs('u2', 'joinGame', { code, name: 'Cody' });
    expect(j.status).toBe('joined');
    const board = await readAdmin(`games/${gameId}/boards/${j.seatId}`);
    expect(board.cells).toHaveLength(25);
    expect(board.marks).toHaveLength(25);
    expect(board.marks[12]).toBe(true);
    expect(board.marks.filter(Boolean)).toHaveLength(1);
  });
  it('rejects joining an ended game', async () => {
    const { gameId, code } = await newGame();
    await admin.doc(`games/${gameId}`).update({ stage: 'ended' });
    expect(await appCodeOf(callAs('u2', 'joinGame', { code, name: 'Cody' }))).toBe('game-ended');
  });
});

describe('whoAmI', () => {
  it('returns seat for members (any stage), null for others, error for unknown code', async () => {
    const { gameId, code, seatId } = await newGame();
    expect(await callAs('u1', 'whoAmI', { code })).toEqual({ gameId, seatId });
    expect(await callAs('u2', 'whoAmI', { code })).toBeNull();
    await admin.doc(`games/${gameId}`).update({ stage: 'ended' });
    expect(await callAs('u1', 'whoAmI', { code })).toEqual({ gameId, seatId });
    expect(await appCodeOf(callAs('u1', 'whoAmI', { code: 'ZZZZZ' }))).toBe('game-not-found');
  });
});
