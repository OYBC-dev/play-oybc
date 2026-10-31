import { env, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { verifyIdToken } from '../src/auth';
import { CLOSE, type StateMsg } from '../src/protocol';
import type { GameRoom } from '../src/room/GameRoom';
import { connect, createGame, isState, tokenFor, wsClient, type WsClient } from './helpers';

const DAY = 24 * 60 * 60 * 1000;

let logSpy: MockInstance<typeof console.log>;
beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

/** Host Ann (`ua`) plus Bob (`ub`) and Cat (`uc`) joined through their sockets. */
async function threeSeats() {
  const g = await createGame('ua', 'Ann');
  const a = await wsClient(g.code, 'ua');
  const b = await wsClient(g.code, 'ub');
  const c = await wsClient(g.code, 'uc');
  const jb = await b.act('join', { name: 'Bob' });
  const jc = await c.act('join', { name: 'Cat' });
  if (!jb.ok || !jc.ok) throw new Error('join failed');
  const bobSeat = (jb.result as { seatId: string }).seatId;
  const catSeat = (jc.result as { seatId: string }).seatId;
  await Promise.all([a.sync(), b.sync(), c.sync()]);
  return { ...g, a, b, c, bobSeat, catSeat };
}

/** Adds 25 plain tasks as `host` and launches (free space is off by default). */
async function launch(host: WsClient): Promise<void> {
  for (let i = 0; i < 25; i++) {
    const r = await host.act('addTask', { taskId: `t${i}`, text: `task number ${i}` });
    if (!r.ok) throw new Error(JSON.stringify(r));
  }
  const r = await host.act('launch');
  if (!r.ok) throw new Error(JSON.stringify(r));
}

const lastState = (c: WsClient, from = 0): StateMsg | undefined => c.since(from).filter(isState).at(-1);

describe('GameRoom', () => {
  it('createGame then hello seats the host with a full state', async () => {
    const g = await createGame('ua', 'Ann');
    const a = await connect(g.code);
    const w = await a.hello(tokenFor('ua'), g.gameId);
    expect(w).toMatchObject({ t: 'welcome', uid: 'ua', gameId: g.gameId, seatId: g.seatId, stage: 'lobby' });
    const s = await a.waitFor<StateMsg>(isState);
    expect(Object.keys(s).sort()).toEqual(['bingos', 'board', 'game', 'reclaims', 'rev', 'roster', 'seats', 'standings', 't', 'view']);
    expect(s.rev).toBe((w as { rev: number }).rev);
    expect(s.game).toMatchObject({ code: g.code, stage: 'lobby', hostSeatId: g.seatId });
    expect(s.seats).toEqual([expect.objectContaining({ seatId: g.seatId, name: 'Ann' })]);
    expect(s).toMatchObject({ view: [], board: null, bingos: [], reclaims: [] });
    a.close();
  });

  it('hello on an unknown code closes 4004', async () => {
    const c = await connect('QQQQ9');
    expect(await c.hello(tokenFor('ux'))).toEqual({ t: 'error', code: 'game-not-found' });
    expect(await c.closed).toBe(CLOSE.NOT_FOUND);
  });

  it('hello with a stale gameId closes 4004', async () => {
    const g = await createGame('ua', 'Ann');
    const c = await connect(g.code);
    expect(await c.hello(tokenFor('ua'), 'a-purged-game-id')).toEqual({ t: 'error', code: 'game-not-found' });
    expect(await c.closed).toBe(CLOSE.NOT_FOUND);
  });

  it('a frame before hello closes 4001', async () => {
    const g = await createGame('ua', 'Ann');
    const c = await connect(g.code);
    c.send({ t: 'act', id: 'x', op: 'join', args: { name: 'Bob' } });
    expect(await c.closed).toBe(CLOSE.BAD_TOKEN);
    expect(c.frames.some((f) => f.t === 'ack')).toBe(false);

    const bad = await connect(g.code);
    expect(await bad.hello('not-a-jwt')).toEqual({ t: 'error', code: 'unauthenticated' });
    expect(await bad.closed).toBe(CLOSE.BAD_TOKEN);
  });

  it('addTask pushes view to every seat with correct redaction', async () => {
    const { a, b, c } = await threeSeats();
    const [fa, fb, fc] = [a.frames.length, b.frames.length, c.frames.length];
    const ack = await a.act('addTask', { taskId: 'k1', text: '@Bob buys a round' });
    expect(ack).toMatchObject({ ok: true, result: { taskId: 'k1' } });
    const sa = await a.waitFor<StateMsg>(isState, fa);
    const sb = await b.waitFor<StateMsg>(isState, fb);
    const sc = await c.waitFor<StateMsg>(isState, fc);
    for (const s of [sa, sb, sc]) expect(Object.keys(s).sort()).toEqual(['game', 'rev', 'roster', 't', 'view']);
    expect(sa.view![0]).toMatchObject({ taskId: 'k1', text: 'Bob buys a round', refs: [[0, 3]] });
    expect(sb.view![0]).toMatchObject({ taskId: 'k1', text: null });
    expect(sc.view![0]).toMatchObject({ taskId: 'k1', text: 'Bob buys a round', refs: [[0, 3]] });
    expect(sa.rev).toBe(sb.rev);
  });

  it('hello after addTask returns the same redacted view as the push', async () => {
    const { a, b, c, code, gameId } = await threeSeats();
    const fb = b.frames.length;
    const fc = c.frames.length;
    await a.act('addTask', { taskId: 'k1', text: '@Bob buys a round' });
    const pushedB = await b.waitFor<StateMsg>(isState, fb);
    const pushedC = await c.waitFor<StateMsg>(isState, fc);
    const b2 = await wsClient(code, 'ub', gameId);
    const c2 = await wsClient(code, 'uc', gameId);
    expect(lastState(b2)!.view).toEqual(pushedB.view);
    expect(lastState(c2)!.view).toEqual(pushedC.view);
    expect(lastState(b2)!.view![0].text).toBeNull();
  });

  it('mark pushes board to the marker and standings to all; a bingo adds bingos+game', async () => {
    const { a, b, c } = await threeSeats();
    await launch(a);
    await Promise.all([a.sync(), b.sync(), c.sync()]);
    let [fa, fb, fc] = [a.frames.length, b.frames.length, c.frames.length];
    expect(await b.act('mark', { cellIndex: 0, marked: true })).toMatchObject({ ok: true, result: { newBingoSeqs: [] } });
    const sb = await b.waitFor<StateMsg>(isState, fb);
    expect(Object.keys(sb).sort()).toEqual(['board', 'rev', 'standings', 't']);
    expect(sb.board!.marks[0]).toBe(true);
    await Promise.all([a.sync(), c.sync()]);
    for (const [cl, from] of [[a, fa], [c, fc]] as const) {
      const pushed = cl.since(from).filter(isState);
      expect(pushed.map((x) => Object.keys(x).sort())).toEqual([['rev', 'standings', 't']]);
      expect(pushed[0].standings!.find((r) => r.name === 'Bob')).toMatchObject({ marked: 1, bingos: 0 });
    }

    for (const i of [1, 2, 3]) await b.act('mark', { cellIndex: i, marked: true });
    await Promise.all([a.sync(), b.sync(), c.sync()]);
    [fa, fb, fc] = [a.frames.length, b.frames.length, c.frames.length];
    expect(await b.act('mark', { cellIndex: 4, marked: true })).toMatchObject({ ok: true, result: { newBingoSeqs: [1] } });
    const bingoB = await b.waitFor<StateMsg>((f) => isState(f) && !!f.bingos, fb);
    const sa = await a.waitFor<StateMsg>(isState, fa);
    const sc = await c.waitFor<StateMsg>(isState, fc);
    expect(Object.keys(bingoB).sort()).toEqual(['bingos', 'board', 'game', 'rev', 'standings', 't']);
    for (const s of [sa, sc]) {
      expect(Object.keys(s).sort()).toEqual(['bingos', 'game', 'rev', 'standings', 't']);
      expect(s.standings![0]).toMatchObject({ name: 'Bob', bingos: 1, firstBingoSeq: 1 });
      expect(s.bingos).toEqual([expect.objectContaining({ seq: 1, name: 'Bob', line: 'row_0' })]);
      expect(s.game!.bingoCount).toBe(1);
    }
  });

  it('two sockets one uid both get state and are both evicted on approve', async () => {
    const { a, b, code, gameId, bobSeat } = await threeSeats();
    const b2 = await wsClient(code, 'ub', gameId);
    expect(b2.welcome.seatId).toBe(bobSeat);
    const f2 = b2.frames.length;
    const fa = a.frames.length;
    await b.act('addTask', { taskId: 'k1', text: 'from the phone' });
    expect((await b2.waitFor<StateMsg>(isState, f2)).view![0]).toMatchObject({ taskId: 'k1', text: 'from the phone' });
    await a.waitFor(isState, fa);

    // a mark on one of Bob's sockets reaches his other socket with the board
    await launch(a);
    await Promise.all([b.sync(), b2.sync()]);
    const fm = b2.frames.length;
    expect(await b.act('mark', { cellIndex: 0, marked: true })).toMatchObject({ ok: true });
    const marked = await b2.waitFor<StateMsg>((f) => isState(f) && !!f.board, fm);
    expect(marked.board!.marks[0]).toBe(true);

    const d = await wsClient(code, 'ud', gameId);
    expect(d.welcome.seatId).toBeNull();
    const filed = await d.act('join', { name: 'bob', reclaim: true });
    expect(filed).toMatchObject({ ok: true, result: { status: 'reclaim-pending' } });
    const reclaimId = (filed as { result: { reclaimId: string } }).result.reclaimId;
    const fd = d.frames.length;
    expect(await a.act('resolveReclaim', { reclaimId, approve: true })).toMatchObject({ ok: true });
    for (const sock of [b, b2]) {
      await sock.waitFor((f) => f.t === 'evicted');
      expect(sock.frames.find((f) => f.t === 'evicted')).toEqual({ t: 'evicted', reason: 'replaced' });
      expect(await sock.closed).toBe(CLOSE.EVICTED);
    }
    expect(await d.waitFor((f) => f.t === 'reclaim', fd)).toEqual({ t: 'reclaim', id: reclaimId, status: 'approved' });
    const full = await d.waitFor<StateMsg>(isState, fd);
    expect(Object.keys(full).sort()).toEqual(['bingos', 'board', 'game', 'reclaims', 'rev', 'roster', 'seats', 'standings', 't', 'view']);
    expect(full.view![0]).toMatchObject({ taskId: 'k1', text: 'from the phone' });

    // hello again on the same socket is whoAmI: it now names the reclaimed seat, and (seated) replays no reclaim
    const fAgain = d.frames.length;
    const again = await d.hello(tokenFor('ud'), gameId);
    expect(again).toMatchObject({ t: 'welcome', uid: 'ud', seatId: bobSeat });
    await d.sync();
    expect(d.since(fAgain).filter((f) => f.t === 'reclaim')).toEqual([]);
  });

  it("a uid's fifth socket supersedes its oldest (1000) and the other four keep their pushes", async () => {
    const g = await createGame('ua', 'Ann');
    const socks = [];
    for (let i = 0; i < 4; i++) socks.push(await wsClient(g.code, 'ua', g.gameId));
    const fifth = await wsClient(g.code, 'ua', g.gameId);
    expect(await socks[0].closed).toBe(1000);
    const from = socks.slice(1).map((s) => s.frames.length);
    expect(await fifth.act('addTask', { taskId: 'k1', text: 'still here' })).toMatchObject({ ok: true });
    for (const [i, s] of socks.slice(1).entries()) {
      expect((await s.waitFor<StateMsg>(isState, from[i])).view![0]).toMatchObject({ taskId: 'k1' });
    }
    // another uid is unaffected by Ann's cap
    const b = await wsClient(g.code, 'ub', g.gameId);
    expect(b.welcome.uid).toBe('ub');
  });

  it('a token that cannot be checked (key fetch failed) closes 1013 try-again, not 4001', async () => {
    const g = await createGame('ua', 'Ann');
    const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(g.code));
    await runInDurableObject(stub, (room: GameRoom) => {
      (room as unknown as { verify: typeof verifyIdToken }).verify = (t, e) =>
        verifyIdToken(t, { ...e, AUTH_MODE: 'firebase' }, async () => { throw new TypeError('fetch failed'); });
    });
    const c = await connect(g.code);
    const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    expect(await c.hello(`${b64({ alg: 'RS256', kid: 'k1' })}.${b64({ sub: 'ua' })}.AAAA`)).toEqual({ t: 'error', code: 'try-again' });
    expect(await c.closed).toBe(CLOSE.TRY_AGAIN);
  });

  it('reclaim: requester gets reclaim{status} and host gets reclaims section', async () => {
    const { a, code, gameId, bobSeat } = await threeSeats();
    const d = await wsClient(code, 'ud', gameId);
    const fa = a.frames.length;
    const filed = await d.act('join', { name: 'Bob', reclaim: true });
    const reclaimId = (filed as { result: { reclaimId: string } }).result.reclaimId;
    const hostView = await a.waitFor<StateMsg>(isState, fa);
    expect(Object.keys(hostView).sort()).toEqual(['reclaims', 'rev', 't']);
    expect(hostView.reclaims).toEqual([expect.objectContaining({ id: reclaimId, requesterUid: 'ud', seatId: bobSeat, status: 'pending' })]);

    const fd = d.frames.length;
    const fa2 = a.frames.length;
    expect(await a.act('resolveReclaim', { reclaimId, approve: false })).toMatchObject({ ok: true });
    expect(await d.waitFor((f) => f.t === 'reclaim', fd)).toEqual({ t: 'reclaim', id: reclaimId, status: 'denied' });
    expect((await a.waitFor<StateMsg>(isState, fa2)).reclaims).toEqual([]);

    // a conflict denial commits and pushes before the failed ack (AppError.push)
    const e = await wsClient(code, 'ue', gameId);
    const second = await e.act('join', { name: 'Cat', reclaim: true });
    const secondId = (second as { result: { reclaimId: string } }).result.reclaimId;
    expect(await e.act('join', { name: 'Eve', reclaim: true })).toMatchObject({ ok: true, result: { status: 'joined' } });
    const fe = e.frames.length;
    const fa3 = a.frames.length;
    const failed = await a.act('resolveReclaim', { reclaimId: secondId, approve: true });
    expect(failed).toMatchObject({ ok: false, code: 'wrong-stage' });
    expect(await e.waitFor((f) => f.t === 'reclaim', fe)).toEqual({ t: 'reclaim', id: secondId, status: 'denied' });
    const ackIndex = a.frames.findIndex((f) => f.t === 'ack' && f === failed);
    const pushIndex = a.frames.findIndex((f, i) => i >= fa3 && isState(f) && Array.isArray(f.reclaims));
    expect(pushIndex).toBeGreaterThanOrEqual(fa3);
    expect(pushIndex).toBeLessThan(ackIndex);
  });

  it('a requester offline when the host resolves learns the outcome on its next hello', async () => {
    const { a, code, gameId } = await threeSeats();
    const d = await wsClient(code, 'ud', gameId);
    const filed = await d.act('join', { name: 'Bob', reclaim: true });
    const reclaimId = (filed as { result: { reclaimId: string } }).result.reclaimId;

    // a reconnect while still pending replays the pending notice
    const d2 = await connect(code);
    expect(await d2.hello(tokenFor('ud'), gameId)).toMatchObject({ t: 'welcome', seatId: null });
    expect(await d2.waitFor((f) => f.t === 'reclaim')).toEqual({ t: 'reclaim', id: reclaimId, status: 'pending' });
    d.close();
    d2.close();
    await Promise.all([d.closed, d2.closed]);

    expect(await a.act('resolveReclaim', { reclaimId, approve: false })).toMatchObject({ ok: true });

    const d3 = await connect(code);
    expect(await d3.hello(tokenFor('ud'), gameId)).toMatchObject({ t: 'welcome', seatId: null });
    expect(await d3.waitFor((f) => f.t === 'reclaim')).toEqual({ t: 'reclaim', id: reclaimId, status: 'denied' });
    // nobody else hears about it
    const e = await connect(code);
    expect(await e.hello(tokenFor('ue'), gameId)).toMatchObject({ t: 'welcome' });
    await e.act('deleteTask', { taskId: 'probe' });
    expect(e.frames.filter((f) => f.t === 'reclaim')).toEqual([]);
  });

  it('reclaims section follows hostSeatId after transferHost', async () => {
    const { a, c, code, gameId, catSeat } = await threeSeats();
    const d = await wsClient(code, 'ud', gameId);
    const filed = await d.act('join', { name: 'Bob', reclaim: true });
    const reclaimId = (filed as { result: { reclaimId: string } }).result.reclaimId;
    await a.sync();
    const [fa, fc] = [a.frames.length, c.frames.length];
    expect(await a.act('transferHost', { toSeatId: catSeat })).toMatchObject({ ok: true });
    const sa = await a.waitFor<StateMsg>(isState, fa);
    const sc = await c.waitFor<StateMsg>(isState, fc);
    expect(sa.game!.hostSeatId).toBe(catSeat);
    expect(sa.reclaims).toEqual([]);
    expect(sc.reclaims).toEqual([expect.objectContaining({ id: reclaimId, status: 'pending' })]);

    const fa2 = a.frames.length;
    expect(await c.act('resolveReclaim', { reclaimId, approve: false })).toMatchObject({ ok: true });
    await a.sync();
    expect(a.since(fa2).filter((f) => isState(f) && f.reclaims !== undefined)).toEqual([]);
  });

  it('hello + 40 acts in one burst (20/s, burst 40) closes 4008', async () => {
    const g = await createGame('ua', 'Ann');
    const a = await wsClient(g.code, 'ua');
    for (let i = 0; i < 60; i++) a.send({ t: 'act', id: `r${i}`, op: 'deleteTask', args: { taskId: 'none' } });
    expect(await a.closed).toBe(CLOSE.RATE_LIMITED);
    const acks = a.frames.filter((f) => f.t === 'ack').length;
    expect(acks).toBeGreaterThanOrEqual(39); // the hello spent one of the 40
    expect(acks).toBeLessThan(60);
  });

  it('hello frames spend rate-limit tokens: looping hello past the burst closes 4008', async () => {
    const g = await createGame('ua', 'Ann');
    const a = await connect(g.code);
    for (let i = 0; i < 60; i++) a.send({ t: 'hello', token: tokenFor('ua'), gameId: g.gameId });
    expect(await a.closed).toBe(CLOSE.RATE_LIMITED);
    const welcomes = a.frames.filter((f) => f.t === 'welcome').length;
    expect(welcomes).toBeGreaterThanOrEqual(40);
    expect(welcomes).toBeLessThan(60);
  });

  it('a 70 KB frame closes 4013', async () => {
    const g = await createGame('ua', 'Ann');
    const a = await wsClient(g.code, 'ua');
    a.send({ t: 'act', id: 'big', op: 'addTask', args: { taskId: 'big', text: 'x'.repeat(70 * 1024) } });
    expect(await a.closed).toBe(CLOSE.TOO_LARGE);
    expect(a.frames.some((f) => f.t === 'ack')).toBe(false);
  });

  it('alarm purges an ended game after 7 days and a later hello closes 4004', async () => {
    const g = await createGame('ua', 'Ann');
    const a = await wsClient(g.code, 'ua');
    await launch(a);
    expect(await a.act('end')).toMatchObject({ ok: true });
    await a.sync();
    const endRev = lastState(a)!.rev;
    const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(g.code));
    const endedAt = await runInDurableObject(stub, async (_room: GameRoom, state) => {
      expect(await state.storage.getAlarm()).not.toBeNull();
      return state.storage.sql.exec<{ endedAt: number }>('SELECT endedAt FROM game').one().endedAt;
    });
    expect(await runInDurableObject(stub, (_r: GameRoom, state) => state.storage.getAlarm())).toBe(endedAt + 7 * DAY);

    const real = Date.now.bind(Date);
    vi.spyOn(Date, 'now').mockImplementation(() => endedAt + 6 * DAY);
    await runInDurableObject(stub, (room: GameRoom) => room.alarm());
    vi.mocked(Date.now).mockImplementation(() => real());
    await a.sync();
    expect(await runInDurableObject(stub, (_r: GameRoom, state) => state.storage.getAlarm())).toBe(endedAt + 7 * DAY);

    vi.mocked(Date.now).mockImplementation(() => endedAt + 7 * DAY);
    await runInDurableObject(stub, (room: GameRoom) => room.alarm());
    vi.mocked(Date.now).mockImplementation(() => real());
    expect(await a.waitFor((f) => f.t === 'error')).toEqual({ t: 'error', code: 'game-not-found' });
    expect(await a.closed).toBe(CLOSE.NOT_FOUND);
    expect(await runInDurableObject(stub, (_r: GameRoom, state) => state.storage.sql.exec('SELECT * FROM game').toArray())).toEqual([]);


    // The purged code can be claimed again: a new game with its own epoch and a fresh rev.
    const reclaimed = await stub.fetch('https://room/internal/claim', {
      method: 'POST', body: JSON.stringify({ gameId: 'g-reused', code: g.code, uid: 'uz', name: 'Zed' }),
    });
    expect(reclaimed.status).toBe(200);
    const zed = await connect(g.code);
    const zw = await zed.hello(tokenFor('uz'), 'g-reused');
    expect(zw).toMatchObject({ t: 'welcome', gameId: 'g-reused', stage: 'lobby' });
    expect((zw as { rev: number }).rev).toBeLessThan(endRev);
    // The old phone's epoch is gone (4004); a bare hello finds the new game, unseated.
    const oldPhone = await connect(g.code);
    expect(await oldPhone.hello(tokenFor('ua'), g.gameId)).toEqual({ t: 'error', code: 'game-not-found' });
    expect(await oldPhone.closed).toBe(CLOSE.NOT_FOUND);
    const bare = await connect(g.code);
    expect(await bare.hello(tokenFor('ua'))).toMatchObject({ t: 'welcome', gameId: 'g-reused', seatId: null, stage: 'lobby' });
    zed.close();
    bare.close();
  });

  it('a failure after the ack never sends a second ack and other sockets still get their push', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { a, b, c, code } = await threeSeats();
    const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(code));
    await runInDurableObject(stub, (_r: GameRoom, state) => {
      const bob = state.getWebSockets().find((ws) => (ws.deserializeAttachment() as { uid: string } | null)?.uid === 'ub')!;
      bob.send = () => { throw new Error('socket send failed'); };
    });
    let [fa, fb, fc] = [a.frames.length, b.frames.length, c.frames.length];
    const first = await a.act('addTask', { taskId: 'k1', text: 'first' });
    expect(first).toMatchObject({ ok: true });
    expect((await c.waitFor<StateMsg>(isState, fc)).view).toHaveLength(1);
    expect((await a.waitFor<StateMsg>(isState, fa)).view).toHaveLength(1);
    await Promise.all([a.sync(), c.sync()]);
    expect(a.since(fa).filter((f) => f.t === 'ack' && f.id === first.id)).toHaveLength(1);
    expect(b.since(fb).filter(isState)).toEqual([]);
    expect(errSpy.mock.calls.map((x) => JSON.parse(String(x[0])).error)).toEqual(['broadcast-failed']);

    errSpy.mockClear();
    await runInDurableObject(stub, (_r: GameRoom, state) => {
      state.storage.setAlarm = () => { throw new Error('alarm failed'); };
    });
    [fa, fc] = [a.frames.length, c.frames.length];
    const ack = await a.act('addTask', { taskId: 'k2', text: 'second' });
    expect(ack).toMatchObject({ ok: true });
    expect((await c.waitFor<StateMsg>(isState, fc)).view).toHaveLength(2);
    await a.sync();
    expect(a.since(fa).filter((f) => f.t === 'ack' && f.id === ack.id)).toHaveLength(1);
    expect(errSpy.mock.calls.map((x) => JSON.parse(String(x[0])).error)).toContain('after-mutation-failed');
    const logged = errSpy.mock.calls.map((x) => String(x[0])).join('\n');
    expect(logged).not.toContain('second');
    expect(logged).not.toContain('Ann');
  });

  it('a failed ack send is logged and the committed op is still broadcast', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { a, b, c, code } = await threeSeats();
    const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(code));
    await runInDurableObject(stub, (_r: GameRoom, state) => {
      const ann = state.getWebSockets().find((ws) => (ws.deserializeAttachment() as { uid: string } | null)?.uid === 'ua')!;
      const real = ann.send.bind(ann);
      ann.send = (m: string | ArrayBuffer | ArrayBufferView) => {
        if (typeof m === 'string' && m.includes('"t":"ack"')) throw new Error('ack send failed');
        real(m);
      };
    });
    const [fa, fb, fc] = [a.frames.length, b.frames.length, c.frames.length];
    a.send({ t: 'act', id: 'lost-ack', op: 'addTask', args: { taskId: 'k1', text: 'committed' } });
    for (const [s, from] of [[a, fa], [b, fb], [c, fc]] as const) {
      expect((await s.waitFor<StateMsg>(isState, from)).view).toEqual([expect.objectContaining({ taskId: 'k1' })]);
    }
    expect(a.since(fa).filter((f) => f.t === 'ack')).toEqual([]);
    expect(errSpy.mock.calls.map((x) => JSON.parse(String(x[0])).error)).toEqual(['ack-failed']);
  });

  it('logs one structured line per act without names, text or tokens', async () => {
    const g = await createGame('ua', 'Ann');
    const a = await wsClient(g.code, 'ua');
    logSpy.mockClear();
    await a.act('addTask', { taskId: 'k1', text: 'secret words' });
    await a.act('deleteTask', { taskId: 'missing' });
    const lines = logSpy.mock.calls.map((c) => JSON.parse(String(c[0])));
    expect(lines).toEqual([
      { op: 'addTask', code: 'ok', gameCode: g.code, ms: expect.any(Number), seats: 1 },
      { op: 'deleteTask', code: 'not-found', gameCode: g.code, ms: expect.any(Number), seats: 1 },
    ]);
    const raw = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    for (const secret of ['secret words', 'Ann', tokenFor('ua')]) expect(raw).not.toContain(secret);
  });
});
