import { env, SELF } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateMsg } from '../src/protocol';
import worker from '../src/index';
import { connect, createGame, isState, randomIp, tokenFor, wsClient } from './helpers';

beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  SELF.fetch(`https://api.test${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': randomIp(), ...headers }, body: JSON.stringify(body),
  });
const admin = { Authorization: 'Bearer test-admin' };

describe('Worker routes', () => {
  it('POST /api/createGame without a token is 401', async () => {
    const res = await post('/api/createGame', { name: 'Ann' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: 'unauthenticated' });
    const forged = await post('/api/createGame', { name: 'Ann' }, { Authorization: 'Bearer not-a-jwt' });
    expect(forged.status).toBe(401);
  });

  it('POST /api/createGame returns code and seat; a second claim on the same code is 409', async () => {
    const res = await post('/api/createGame', { name: '  Ann ' }, { Authorization: `Bearer ${tokenFor('ua')}` });
    expect(res.status).toBe(200);
    const g = (await res.json()) as { gameId: string; code: string; seatId: string };
    expect(g.code).toMatch(/^[A-Z0-9]{5}$/);
    expect(g.gameId).toEqual(expect.any(String));
    expect(g.seatId).toEqual(expect.any(String));

    const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(g.code));
    const again = await stub.fetch('https://room/internal/claim', {
      method: 'POST', body: JSON.stringify({ gameId: 'other', code: g.code, uid: 'ub', name: 'Bob' }),
    });
    expect(again.status).toBe(409);

    const bad = await post('/api/createGame', { name: '   ' }, { Authorization: `Bearer ${tokenFor('ua')}` });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ code: 'invalid-name' });
  });

  it('/admin without the token is 401; with it lists seats', async () => {
    const g = await createGame('ua', 'Ann');
    expect((await SELF.fetch(`https://api.test/admin/${g.code}/seats`)).status).toBe(401);
    expect((await SELF.fetch(`https://api.test/admin/${g.code}/seats`, { headers: { Authorization: 'Bearer test-admiN' } })).status).toBe(401);
    const res = await SELF.fetch(`https://api.test/admin/${g.code}/seats`, { headers: admin });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ seatId: g.seatId, name: 'Ann', occupied: true, host: true }]);
    expect((await SELF.fetch('https://api.test/admin/QQQQ9/seats', { headers: admin })).status).toBe(404);
  });

  it('admin transferHost moves the host', async () => {
    const g = await createGame('ua', 'Ann');
    const a = await wsClient(g.code, 'ua');
    const b = await wsClient(g.code, 'ub');
    const jb = await b.act('join', { name: 'Bob' });
    const bobSeat = (jb as { result: { seatId: string } }).result.seatId;
    await a.sync();
    const fa = a.frames.length;
    expect((await post(`/admin/${g.code}/transferHost`, { seatId: bobSeat })).status).toBe(401);
    const res = await post(`/admin/${g.code}/transferHost`, { seatId: bobSeat }, admin);
    expect(res.status).toBe(200);
    expect((await a.waitFor<StateMsg>(isState, fa)).game!.hostSeatId).toBe(bobSeat);
    const seats = (await (await SELF.fetch(`https://api.test/admin/${g.code}/seats`, { headers: admin })).json()) as Array<{ seatId: string; host: boolean }>;
    expect(seats.find((s) => s.host)!.seatId).toBe(bobSeat);
    const unknown = await post(`/admin/${g.code}/transferHost`, { seatId: 'nobody' }, admin);
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({ code: 'unknown-seat' });
  });

  it('admin transferHost with a body that is not {seatId: string} is 400', async () => {
    const g = await createGame('ua', 'Ann');
    for (const body of [null, 'x', 7, [], { seatId: 3 }]) {
      const res = await post(`/admin/${g.code}/transferHost`, body, admin);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(await res.json()).toEqual({ code: 'invalid-argument' });
    }
  });

  /** Calls the Worker with a room namespace whose `fetch` is `roomFetch`. */
  const createWithRoom = (roomFetch: () => Promise<Response>) => {
    const rooms = { idFromName: (n: string) => n, get: () => ({ fetch: roomFetch }) };
    const req = new Request('https://api.test/api/createGame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': randomIp(), Authorization: `Bearer ${tokenFor('ua')}` },
      body: JSON.stringify({ name: 'Ann' }),
    });
    return worker.fetch(req, { ...env, GAME_ROOM: rooms } as unknown as typeof env);
  };

  it('createGame passes a non-JSON room failure on as JSON with CORS', async () => {
    const res = await createWithRoom(async () => new Response('boom', { status: 500 }));
    expect(res.status).toBe(500);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await res.json()).toEqual({ code: 'unknown' });
  });

  it('createGame answers a thrown failure with a JSON 500 with CORS', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await createWithRoom(async () => { throw new Error('room unreachable'); });
    expect(res.status).toBe(500);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await res.json()).toEqual({ code: 'unknown' });
    expect(errSpy).toHaveBeenCalledTimes(1);
  });

  it('malformed codes are 404', async () => {
    for (const path of ['/ws/', '/ws/a/b', '/ws/ABCD', '/ws/A/B/C', '/ws/ABCDEF', '/ws/AB-CD']) {
      const res = await SELF.fetch(`https://api.test${path}`, { headers: { Upgrade: 'websocket', 'CF-Connecting-IP': randomIp() } });
      expect(res.status, path).toBe(404);
    }
  });

  it('a lowercase code reaches the same object as its uppercase form', async () => {
    const g = await createGame('ua', 'Ann');
    const c = await connect(g.code.toLowerCase());
    expect(await c.hello(tokenFor('ua'))).toMatchObject({ t: 'welcome', gameId: g.gameId, seatId: g.seatId });
  });

  it('createGame is limited to 10 per minute per IP', async () => {
    const ip = randomIp();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await post('/api/createGame', { name: 'Ann' }, { Authorization: `Bearer ${tokenFor('ua')}`, 'CF-Connecting-IP': ip });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses[10]).toBe(429);
  });

  it('at 100 sockets a bare upgrade evicts the oldest hello-less socket (4001); all attached refuses 429', async () => {
    const g = await createGame('ua', 'Ann');
    const bare = [];
    for (let i = 0; i < 100; i++) bare.push(await connect(g.code));
    const extra = await connect(g.code);
    expect(await extra.hello(tokenFor('ua'))).toMatchObject({ t: 'welcome' });
    expect(await bare[0].closed).toBe(4001);
    for (const c of [...bare.slice(1), extra]) c.close();

    const full = await createGame('ub', 'Bob');
    const attached = [];
    for (let i = 0; i < 100; i++) attached.push(await wsClient(full.code, `spectator-${i}`));
    const refused = await SELF.fetch(`https://api.test/ws/${full.code}`, { headers: { Upgrade: 'websocket', 'CF-Connecting-IP': randomIp() } });
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ code: 'resource-exhausted' });
    for (const c of attached) c.close();
  });

  it('createGame answers a CORS preflight', async () => {
    const res = await SELF.fetch('https://api.test/api/createGame', {
      method: 'OPTIONS', headers: { Origin: 'https://play.example', 'Access-Control-Request-Method': 'POST' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });
});
