import { beforeEach, describe, expect, it } from 'vitest';
import { canSeeText, type PoolTask } from 'game-core';
import { admin, appCodeOf, callAs, clearFirestore, readAdmin } from './helpers';

beforeEach(clearFirestore);

/** Stephen (host, u1) + Cody (u2) + Seth (u3). Seat ids are random; labelled s1/s2/s3. */
async function setup() {
  const g = await callAs('u1', 'createGame', { name: 'Stephen' });
  const c = await callAs('u2', 'joinGame', { code: g.code, name: 'Cody' });
  const s = await callAs('u3', 'joinGame', { code: g.code, name: 'Seth' });
  return { gameId: g.gameId as string, s1: g.seatId as string, s2: c.seatId as string, s3: s.seatId as string };
}

const view = async (gameId: string, seat: string) => (await readAdmin(`games/${gameId}/views/${seat}`)).entries as any[];

describe('addTask', () => {
  it('hides a task from the seat it mentions', async () => {
    const { gameId, s1, s2, s3 } = await setup();
    const { taskId } = await callAs('u2', 'addTask', { gameId, text: '@Stephen falls asleep' });
    expect((await readAdmin(`games/${gameId}/tasks/${taskId}`)).mentions.seatIds).toEqual([s1]);
    expect((await view(gameId, s1))[0].text).toBeNull();
    expect((await view(gameId, s2))[0].text).toBe('@Stephen falls asleep');
    expect((await view(gameId, s3))[0].text).toBe('@Stephen falls asleep');
  });
  it('@someone is visible only to its author', async () => {
    const { gameId, s1, s2, s3 } = await setup();
    await callAs('u3', 'addTask', { gameId, text: '@someone takes a shot' });
    expect((await view(gameId, s1))[0].text).toBeNull();
    expect((await view(gameId, s2))[0].text).toBeNull();
    expect((await view(gameId, s3))[0].text).toBe('@someone takes a shot');
  });
  it('carries the unresolved token on unknown-mention', async () => {
    const { gameId } = await setup();
    const err: any = await callAs('u2', 'addTask', { gameId, text: '@Bob sings' }).catch((e) => e);
    expect(err.details.code).toBe('unknown-mention');
    expect(err.details.token).toBe('@Bob');
  });
  it('rejects self-mention, unknown mention and bad text', async () => {
    const { gameId } = await setup();
    expect(await appCodeOf(callAs('u2', 'addTask', { gameId, text: '@Cody dances' }))).toBe('self-mention');
    expect(await appCodeOf(callAs('u2', 'addTask', { gameId, text: '@Bob sings' }))).toBe('unknown-mention');
    expect(await appCodeOf(callAs('u2', 'addTask', { gameId, text: '' }))).toBe('invalid-text');
    expect(await appCodeOf(callAs('u2', 'addTask', { gameId, text: '   ' }))).toBe('invalid-text');
    expect(await appCodeOf(callAs('u2', 'addTask', { gameId, text: 'x'.repeat(121) }))).toBe('invalid-text');
    for (const text of [{}, 42, ['x'], null]) {
      expect(await appCodeOf(callAs('u2', 'addTask', { gameId, text }))).toBe('invalid-text');
    }
    expect(await appCodeOf(callAs('u2', 'addTask', { gameId, text: 'y'.repeat(122).replace(/^y/, ' ') + ' ' }))).toBe('invalid-text');
  });
  it('trims text and accepts exactly 120 chars', async () => {
    const { gameId } = await setup();
    const { taskId } = await callAs('u2', 'addTask', { gameId, text: `  ${'x'.repeat(120)}  ` });
    expect((await readAdmin(`games/${gameId}/tasks/${taskId}`)).text).toBe('x'.repeat(120));
  });
  it('rejects non-members and unknown games', async () => {
    const { gameId } = await setup();
    expect(await appCodeOf(callAs('u9', 'addTask', { gameId, text: 'hi' }))).toBe('https:functions/permission-denied');
    expect(await appCodeOf(callAs('u2', 'addTask', { gameId: 'nope', text: 'hi' }))).toBe('game-not-found');
    expect(await appCodeOf(callAs('u2', 'addTask', { gameId: 'a/b', text: 'hi' }))).toBe('game-not-found');
  });
  it('keeps shortfalls current and never stores zeros', async () => {
    const { gameId, s1, s2, s3 } = await setup();
    expect((await readAdmin(`games/${gameId}`)).shortfalls ?? {}).toEqual({ [s1]: 24, [s2]: 24, [s3]: 24 });
    for (let i = 0; i < 23; i++) await callAs('u1', 'addTask', { gameId, text: `plain ${i}` });
    await callAs('u3', 'addTask', { gameId, text: '@Cody wins' });
    expect((await readAdmin(`games/${gameId}`)).shortfalls).toEqual({ [s2]: 1 });
    await callAs('u1', 'addTask', { gameId, text: 'one more' });
    expect((await readAdmin(`games/${gameId}`)).shortfalls).toEqual({});
  });
  it('10 concurrent adds from 3 users all land in every view', async () => {
    const { gameId, s1, s2, s3 } = await setup();
    const users = ['u1', 'u2', 'u3'];
    // The emulator occasionally answers a contended transaction with INTERNAL ("Transaction is invalid or closed"),
    // which the Admin SDK does not retry. The failed call wrote nothing, so a client-side retry is faithful to the app.
    const add = async (user: string, text: string) => {
      for (let attempt = 1; ; attempt++) {
        try { return await callAs(user, 'addTask', { gameId, text }); }
        catch (e) { if (attempt >= 4 || (e as { code?: string }).code !== 'functions/internal') throw e; }
      }
    };
    await Promise.all(Array.from({ length: 10 }, (_, i) => add(users[i % 3], `t${i}`)));
    for (const s of [s1, s2, s3]) expect((await view(gameId, s)).map((e) => e.text).sort()).toEqual(Array.from({ length: 10 }, (_, i) => `t${i}`).sort());
    // 10 transactions contend on one game doc and retry; takes 7-12 s unloaded, so the 20 s default flakes under load.
  }, 60_000);
});

describe('deleteTask', () => {
  it('author deletes own; non-author non-host denied; host deletes any', async () => {
    const { gameId, s1 } = await setup();
    const a = await callAs('u2', 'addTask', { gameId, text: 'mine' });
    const b = await callAs('u2', 'addTask', { gameId, text: 'other' });
    expect(await appCodeOf(callAs('u3', 'deleteTask', { gameId, taskId: a.taskId }))).toBe('https:functions/permission-denied');
    await callAs('u2', 'deleteTask', { gameId, taskId: a.taskId });
    expect((await view(gameId, s1)).map((e) => e.taskId)).toEqual([b.taskId]);
    await callAs('u1', 'deleteTask', { gameId, taskId: b.taskId });
    const views = await admin.collection(`games/${gameId}/views`).get();
    expect(views.size).toBe(3);
    for (const d of views.docs) expect(d.data().entries).toEqual([]);
    expect(await appCodeOf(callAs('u1', 'deleteTask', { gameId, taskId: b.taskId }))).toBe('https:functions/not-found');
  });
});

describe('stage', () => {
  it('rejects add and delete outside the lobby', async () => {
    const { gameId } = await setup();
    const { taskId } = await callAs('u2', 'addTask', { gameId, text: 'hi' });
    await admin.doc(`games/${gameId}`).update({ stage: 'playing' });
    expect(await appCodeOf(callAs('u2', 'addTask', { gameId, text: 'again' }))).toBe('wrong-stage');
    expect(await appCodeOf(callAs('u2', 'deleteTask', { gameId, taskId }))).toBe('wrong-stage');
  });
});

describe('leak check', () => {
  it('no view entry shows text a viewer may not see', async () => {
    const { gameId, s1, s2, s3 } = await setup();
    await callAs('u2', 'addTask', { gameId, text: '@Stephen falls asleep' });
    await callAs('u3', 'addTask', { gameId, text: '@someone takes a shot' });
    await callAs('u1', 'addTask', { gameId, text: '@anyone cheers' });
    await callAs('u1', 'addTask', { gameId, text: '@Cody and @Seth hug' });
    await callAs('u2', 'addTask', { gameId, text: 'plain' });
    const tasks = new Map<string, PoolTask>();
    for (const d of (await admin.collection(`games/${gameId}/tasks`).get()).docs) tasks.set(d.id, { id: d.id, ...(d.data() as any) });
    expect(tasks.size).toBe(5);
    const viewDocs = await admin.collection(`games/${gameId}/views`).get();
    expect(viewDocs.size).toBe((await admin.collection(`games/${gameId}/seats`).get()).size);
    expect(viewDocs.docs.map((d) => d.id).sort()).toEqual([s1, s2, s3].sort());
    for (const vd of viewDocs.docs) {
      const seat = vd.id;
      const entries = vd.data().entries as any[];
      expect(entries).toHaveLength(5);
      for (const e of entries) {
        const t = tasks.get(e.taskId)!;
        expect(e.text === null).toBe(!canSeeText(t, seat));
        if (e.text !== null) expect(e.text).toBe(t.text);
      }
    }
  });
});
