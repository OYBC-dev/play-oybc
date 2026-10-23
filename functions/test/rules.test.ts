import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-play-oybc',
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'codes/ABCD'), { gameId: 'g1' });
    await setDoc(doc(db, 'games/g1'), { code: 'ABCD', stage: 'lobby', hostSeatId: 's1', createdAt: 1, bingoCount: 0, shortfalls: {}, reviewGate: false });
    await setDoc(doc(db, 'games/g1/members/u1'), { seatId: 's1' });
    await setDoc(doc(db, 'games/g1/members/u2'), { seatId: 's2' });
    await setDoc(doc(db, 'games/g1/seats/s1'), { name: 'A', nameKey: 'a', joinedAt: 1 });
    await setDoc(doc(db, 'games/g1/seats/s2'), { name: 'B', nameKey: 'b', joinedAt: 2 });
    await setDoc(doc(db, 'games/g1/tasks/t1'), { text: 'x', authorSeatId: 's1', mentions: [], createdAt: 1 });
    for (const s of ['s1', 's2']) {
      await setDoc(doc(db, `games/g1/views/${s}`), { entries: [], updatedAt: 1 });
      await setDoc(doc(db, `games/g1/boards/${s}`), { cells: [], marks: [], completedLines: [], announcedLines: [] });
    }
    await setDoc(doc(db, 'games/g1/bingos/b1'), { seq: 1, seatId: 's2', name: 'B', line: 'r0', playerBingoNumber: 1, at: 1, status: 'announced' });
    await setDoc(doc(db, 'games/g1/bingos/b2'), { seq: 2, seatId: 's2', name: 'B', line: 'r1', playerBingoNumber: 2, at: 2, status: 'pending' });
    await setDoc(doc(db, 'games/g1/reclaims/r1'), { requesterUid: 'u9', name: 'C', seatId: 's2', status: 'pending', createdAt: 1 });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const readPaths = ['games/g1', 'games/g1/seats/s1', 'games/g1/seats/s2', 'games/g1/views/s1', 'games/g1/boards/s1', 'games/g1/members/u1'];
const deniedForU1 = ['games/g1/views/s2', 'games/g1/boards/s2', 'games/g1/members/u2', 'games/g1/tasks/t1', 'codes/ABCD'];
const allPaths = [...readPaths, ...deniedForU1, 'games/g1/bingos/b1', 'games/g1/reclaims/r1'];

describe('member u1 (host seat s1)', () => {
  it.each(readPaths)('can read %s', async (p) => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext('u1').firestore(), p)));
  });
  it.each(deniedForU1)('cannot read %s', async (p) => {
    await assertFails(getDoc(doc(env.authenticatedContext('u1').firestore(), p)));
  });
  it('can query announced bingos', async () => {
    const db = env.authenticatedContext('u1').firestore();
    await assertSucceeds(getDocs(query(collection(db, 'games/g1/bingos'), where('status', '==', 'announced'))));
  });
  it('cannot query bingos without the filter', async () => {
    const db = env.authenticatedContext('u1').firestore();
    await assertFails(getDocs(collection(db, 'games/g1/bingos')));
  });
  it('cannot read a non-announced bingo directly', async () => {
    await assertFails(getDoc(doc(env.authenticatedContext('u1').firestore(), 'games/g1/bingos/b2')));
  });
  it.each(allPaths)('cannot write %s', async (p) => {
    const d = doc(env.authenticatedContext('u1').firestore(), p);
    await assertFails(setDoc(d, { x: 1 }));
    await assertFails(updateDoc(d, { x: 1 }));
    await assertFails(deleteDoc(d));
  });
});

describe('non-member u9', () => {
  it.each(allPaths.filter((p) => p !== 'games/g1/reclaims/r1'))('cannot read %s', async (p) => {
    await assertFails(getDoc(doc(env.authenticatedContext('u9').firestore(), p)));
  });
  it('cannot query announced bingos', async () => {
    const db = env.authenticatedContext('u9').firestore();
    await assertFails(getDocs(query(collection(db, 'games/g1/bingos'), where('status', '==', 'announced'))));
  });
  it('unauthenticated cannot read games/g1', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'games/g1')));
  });
});

describe('reclaims', () => {
  const r = 'games/g1/reclaims/r1';
  it('requester u9 can read', async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext('u9').firestore(), r)));
  });
  it('host member u1 can read', async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext('u1').firestore(), r)));
  });
  it('other member u2 cannot read', async () => {
    await assertFails(getDoc(doc(env.authenticatedContext('u2').firestore(), r)));
  });
});
