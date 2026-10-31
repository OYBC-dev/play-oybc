import type { GameSnapshot } from './GameClient';
import { FakeSocket } from '../test/fakeSocket';
import { appErrorCode } from './errorMessages';
import { createWsGameClient } from './wsGameClient';

const GAME = { code: 'ABCDE', stage: 'lobby', hostSeatId: 's1', createdAt: 0, bingoCount: 0, shortfalls: {}, reviewGate: false };

let codeSeq = 0;
const nextCode = () => `W${++codeSeq}`;

function client(fetchImpl: typeof fetch = vi.fn()) {
  return createWsGameClient('wss://play.example', {
    getToken: async () => 'tok',
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    fetchImpl,
  });
}

/** Lets pending promise callbacks run. */
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.reset();
  sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createWsGameClient', () => {
  it('createGame POSTs with the bearer token and maps a 400 code to details.code', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ gameId: 'g9', code: 'QWERT', seatId: 's1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'invalid-name' }), { status: 400 }));
    const c = client(fetchImpl);
    await expect(c.createGame('Ann')).resolves.toEqual({ gameId: 'g9', code: 'QWERT', seatId: 's1' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://play.example/api/createGame');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tok');
    expect(JSON.parse(String(init?.body))).toEqual({ name: 'Ann' });
    expect(sessionStorage.getItem('play.codeFor.g9')).toBe('QWERT');
    const err = await c.createGame('').catch((e: unknown) => e);
    expect(appErrorCode(err)).toBe('invalid-name');
  });

  it('subscribe emits GameSnapshot with reclaims [] by default', async () => {
    const c = client();
    const code = nextCode();
    const who = c.whoAmI(code);
    const sock = FakeSocket.last();
    sock.open();
    await flush();
    sock.serverSend({ t: 'welcome', uid: 'u1', gameId: 'g1', seatId: 's1', stage: 'lobby', rev: 1 });
    await expect(who).resolves.toEqual({ gameId: 'g1', seatId: 's1' });
    const snaps: GameSnapshot[] = [];
    const onError = vi.fn();
    const stop = c.subscribe('g1', 's1', (s) => snaps.push(s), onError);
    sock.serverSend({ t: 'state', rev: 1, game: GAME, seats: [], view: [], board: null, bingos: [] });
    expect(snaps).toHaveLength(1);
    expect(snaps[0].reclaims).toEqual([]);
    expect(snaps[0].board).toBeNull();
    expect(snaps[0].mySeatId).toBe('s1');
    stop();
    expect(sock.closeCalls).toHaveLength(0);
    expect(onError).not.toHaveBeenCalled();
  });

  it('toggleMark sends mark with cellIndex and marked', async () => {
    const c = client();
    const code = nextCode();
    sessionStorage.setItem('play.codeFor.g2', code);
    const stop = c.subscribe('g2', 's1', () => {}, () => {});
    const sock = FakeSocket.last();
    expect(sock.url).toBe(`wss://play.example/ws/${code}`);
    sock.open();
    await flush();
    expect(sock.frames()[0]).toEqual({ t: 'hello', token: 'tok', gameId: 'g2' });
    sock.serverSend({ t: 'welcome', uid: 'u1', gameId: 'g2', seatId: 's1', stage: 'playing', rev: 1 });
    const res = c.toggleMark('g2', 7, true);
    const act = sock.frames().find((f) => f.t === 'act') as { id: string; op: string; args: unknown };
    expect(act).toMatchObject({ op: 'mark', args: { cellIndex: 7, marked: true } });
    sock.serverSend({ t: 'ack', id: act.id, ok: true, result: { marks: [true], completedLines: [], newBingoSeqs: [] } });
    await expect(res).resolves.toEqual({ marks: [true], completedLines: [], newBingoSeqs: [] });
    stop();
  });

  it('leave closes the room socket at once and the next use opens a fresh one', async () => {
    const c = client();
    const code = nextCode();
    sessionStorage.setItem('play.codeFor.g3', code);
    const stop = c.subscribe('g3', 's1', () => {}, () => {});
    const sock = FakeSocket.last();
    sock.open();
    await flush();
    sock.serverSend({ t: 'welcome', uid: 'u1', gameId: 'g3', seatId: 's1', stage: 'lobby', rev: 1 });
    c.leave('g3');
    expect(sock.closeCalls).toEqual([1000]);
    stop();
    const count = FakeSocket.instances.length;
    c.leave('g3'); // nothing live: never opens a socket just to close it
    expect(FakeSocket.instances).toHaveLength(count);
    const again = c.subscribe('g3', 's1', () => {}, () => {});
    expect(FakeSocket.instances).toHaveLength(count + 1);
    again();
  });

  it('leave on an unknown game is a no-op', () => {
    const c = client();
    c.leave('nope');
    expect(FakeSocket.instances).toHaveLength(0);
  });
});
