import { doc, getDoc } from 'firebase/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { appCodeOf, callAs, clearFirestore, firestoreAs, readAdmin, uidOf } from './helpers';

beforeEach(clearFirestore);

/** Host u1, u2 (Cody), 30 tasks, launched; u9 asks to reclaim Cody's seat by typing "cody". */
async function withReclaim(launch = true) {
  const g = await callAs('u1', 'createGame', { name: 'Stephen' });
  const c = await callAs('u2', 'joinGame', { code: g.code, name: 'Cody' });
  const gameId = g.gameId as string;
  for (let i = 0; i < 30; i++) await callAs('u1', 'addTask', { gameId, text: `plain ${i}` });
  if (launch) await callAs('u1', 'launchGame', { gameId });
  const j = await callAs('u9', 'joinGame', { code: g.code, name: 'cody' });
  expect(j.status).toBe('reclaim-pending');
  return { gameId, hostSeat: g.seatId as string, codySeat: c.seatId as string, reclaimId: j.reclaimId as string };
}

describe('resolveReclaim', () => {
  it('rejects non-host', async () => {
    const { gameId, reclaimId } = await withReclaim();
    expect(await appCodeOf(callAs('u2', 'resolveReclaim', { gameId, reclaimId, approve: true }))).toBe('not-host');
  });
  it('approve moves the seat to the requester and swaps board access', async () => {
    const { gameId, codySeat, reclaimId } = await withReclaim();
    await callAs('u1', 'resolveReclaim', { gameId, reclaimId, approve: true });
    const u9 = await uidOf('u9');
    expect(await readAdmin(`games/${gameId}/members/${u9}`)).toEqual({ seatId: codySeat });
    expect(await readAdmin(`games/${gameId}/members/${await uidOf('u2')}`)).toBeUndefined();
    expect((await readAdmin(`games/${gameId}/reclaims/${reclaimId}`)).status).toBe('approved');
    const path = `games/${gameId}/boards/${codySeat}`;
    expect((await getDoc(doc(await firestoreAs('u9'), path))).exists()).toBe(true);
    await expect(getDoc(doc(await firestoreAs('u2'), path))).rejects.toThrow();
  });
  it('deny marks denied without touching members', async () => {
    const { gameId, codySeat, reclaimId } = await withReclaim();
    await callAs('u1', 'resolveReclaim', { gameId, reclaimId, approve: false });
    expect((await readAdmin(`games/${gameId}/reclaims/${reclaimId}`)).status).toBe('denied');
    expect(await readAdmin(`games/${gameId}/members/${await uidOf('u2')}`)).toEqual({ seatId: codySeat });
    expect(await readAdmin(`games/${gameId}/members/${await uidOf('u9')}`)).toBeUndefined();
  });
  it('rejects an already-resolved reclaim', async () => {
    const { gameId, reclaimId } = await withReclaim();
    await callAs('u1', 'resolveReclaim', { gameId, reclaimId, approve: false });
    expect(await appCodeOf(callAs('u1', 'resolveReclaim', { gameId, reclaimId, approve: true }))).toBe('wrong-stage');
  });
  it('validates input', async () => {
    const { gameId, reclaimId } = await withReclaim();
    expect(await appCodeOf(callAs('u1', 'resolveReclaim', { gameId, reclaimId: 'nope', approve: true }))).toBe('https:functions/not-found');
    expect(await appCodeOf(callAs('u1', 'resolveReclaim', { gameId, reclaimId: 'a/b', approve: true }))).toBe('https:functions/not-found');
    expect(await appCodeOf(callAs('u1', 'resolveReclaim', { gameId, reclaimId, approve: 'yes' }))).toBe('https:functions/invalid-argument');
  });
  it('works in the lobby too', async () => {
    const { gameId, codySeat, reclaimId } = await withReclaim(false);
    await callAs('u1', 'resolveReclaim', { gameId, reclaimId, approve: true });
    expect(await readAdmin(`games/${gameId}/members/${await uidOf('u9')}`)).toEqual({ seatId: codySeat });
  });
  it('rejects approval when the requester already holds a seat, and denies the request', async () => {
    const { gameId, codySeat, reclaimId } = await withReclaim();
    // u9 stopped waiting and was seated by another route (simulated).
    const u9 = await uidOf('u9');
    const { admin } = await import('./helpers');
    await admin.doc(`games/${gameId}/members/${u9}`).set({ seatId: 'other' });
    expect(await appCodeOf(callAs('u1', 'resolveReclaim', { gameId, reclaimId, approve: true }))).toBe('wrong-stage');
    expect((await readAdmin(`games/${gameId}/reclaims/${reclaimId}`)).status).toBe('denied');
    expect(await readAdmin(`games/${gameId}/members/${await uidOf('u2')}`)).toEqual({ seatId: codySeat });
    expect(await readAdmin(`games/${gameId}/members/${u9}`)).toEqual({ seatId: 'other' });
  });
  it('reclaiming the host seat after transfer keeps hostSeatId', async () => {
    const g = await callAs('u1', 'createGame', { name: 'Stephen' });
    const c = await callAs('u2', 'joinGame', { code: g.code, name: 'Cody' });
    const gameId = g.gameId as string;
    await callAs('u1', 'transferHost', { gameId, toSeatId: c.seatId });
    const j = await callAs('u9', 'joinGame', { code: g.code, name: 'stephen' });
    await callAs('u2', 'resolveReclaim', { gameId, reclaimId: j.reclaimId, approve: true });
    expect(await readAdmin(`games/${gameId}/members/${await uidOf('u9')}`)).toEqual({ seatId: g.seatId });
    expect((await readAdmin(`games/${gameId}`)).hostSeatId).toBe(c.seatId);
  });
});

describe('transferHost', () => {
  it('rejects non-host', async () => {
    const g = await callAs('u1', 'createGame', { name: 'Stephen' });
    const c = await callAs('u2', 'joinGame', { code: g.code, name: 'Cody' });
    expect(await appCodeOf(callAs('u2', 'transferHost', { gameId: g.gameId, toSeatId: c.seatId }))).toBe('not-host');
  });
  it('hands the host role over and strips the old host', async () => {
    const { gameId, codySeat } = await withReclaim(false);
    await callAs('u1', 'transferHost', { gameId, toSeatId: codySeat });
    expect((await readAdmin(`games/${gameId}`)).hostSeatId).toBe(codySeat);
    expect(await appCodeOf(callAs('u1', 'launchGame', { gameId }))).toBe('not-host');
    await callAs('u2', 'launchGame', { gameId });
    expect((await readAdmin(`games/${gameId}`)).stage).toBe('playing');
  });
  it('rejects an unknown or malformed seat', async () => {
    const { gameId } = await withReclaim(false);
    expect(await appCodeOf(callAs('u1', 'transferHost', { gameId, toSeatId: 'ghost' }))).toBe('unknown-seat');
    expect(await appCodeOf(callAs('u1', 'transferHost', { gameId, toSeatId: 'a/b' }))).toBe('unknown-seat');
    expect(await appCodeOf(callAs('u1', 'transferHost', { gameId, toSeatId: 5 }))).toBe('unknown-seat');
  });
});
