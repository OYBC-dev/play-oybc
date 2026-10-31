import { dealableFor, freeSpaceOf, tasksPerBoardOf, type GameSnapshot } from './GameClient';
import { FakeSocket } from '../test/fakeSocket';
import { getRoom, RoomConnection, type RoomOptions } from './roomConnection';
import { appErrorCode } from './errorMessages';

const GAME = { code: 'ABCDE', stage: 'lobby', hostSeatId: 's1', createdAt: 0, bingoCount: 0, shortfalls: {}, reviewGate: false };
const SEATS = [{ seatId: 's1', name: 'Me', nameKey: 'me', joinedAt: 1 }];
const VIEW = [{ taskId: 't1', authorName: 'Me', text: 'One', mine: true }];
const WELCOME = { t: 'welcome', uid: 'u1', gameId: 'g1', seatId: 's1', stage: 'lobby', rev: 3 };
const FULL = { t: 'state', rev: 3, game: GAME, seats: SEATS, view: VIEW, board: null, bingos: [] };

let codeSeq = 0;
function makeRoom(over: Partial<RoomOptions> = {}): RoomConnection {
  return new RoomConnection({
    url: 'ws://srv',
    code: `R${++codeSeq}`,
    getToken: async () => 'tok',
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    random: () => 0.5,
    ...over,
  });
}

/** Lets pending promise callbacks (the async token fetch) run. */
const flush = () => vi.advanceTimersByTimeAsync(0);

/** Opens `sock`, waits for its hello, and answers `welcome`. */
async function handshake(sock: FakeSocket, welcome: object = WELCOME): Promise<void> {
  sock.open();
  await flush();
  sock.serverSend(welcome);
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.reset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('RoomConnection', () => {
  it('hello resolves on welcome and emits one snapshot from the full state', async () => {
    const room = makeRoom();
    const snaps: GameSnapshot[] = [];
    room.onSnapshot((s) => snaps.push(s));
    const hello = room.hello('g1');
    const sock = FakeSocket.last();
    expect(sock.url).toBe(`ws://srv/ws/${room.code}`);
    sock.open();
    await flush();
    expect(sock.frames()).toEqual([{ t: 'hello', token: 'tok', gameId: 'g1' }]);
    sock.serverSend(WELCOME);
    await expect(hello).resolves.toMatchObject({ gameId: 'g1', seatId: 's1' });
    expect(room.status).toBe('ready');
    expect(snaps).toHaveLength(0);
    sock.serverSend(FULL);
    expect(snaps).toEqual([{ game: GAME, mySeatId: 's1', seats: SEATS, view: VIEW, board: null, bingos: [], standings: [], reclaims: [] }]);
    // A later frame replaces only the sections it carries.
    sock.serverSend({ t: 'state', rev: 4, view: [] });
    expect(snaps).toHaveLength(2);
    expect(snaps[1]).toMatchObject({ game: GAME, seats: SEATS, view: [] });
  });

  it('a frame without standings, refs, dealable, tasksPerBoard or freeSpace is a complete snapshot; standings default to []', async () => {
    const room = makeRoom();
    const snaps: GameSnapshot[] = [];
    room.onSnapshot((s) => snaps.push(s));
    await handshake(FakeSocket.last());
    FakeSocket.last().serverSend(FULL);
    expect(snaps).toHaveLength(1);
    expect(snaps[0].standings).toEqual([]);
    expect(tasksPerBoardOf(snaps[0].game)).toBe(25);
    expect(dealableFor(snaps[0].game, 's1')).toBe(0);
    expect(freeSpaceOf(snaps[0].game)).toBe(false);
  });

  it('merges the standings section and the new game fields when the frame carries them', async () => {
    const room = makeRoom();
    const snaps: GameSnapshot[] = [];
    room.onSnapshot((s) => snaps.push(s));
    await handshake(FakeSocket.last());
    const game = { ...GAME, freeSpace: true, tasksPerBoard: 24, dealable: { s1: 6 } };
    const standings = [{ seatId: 's1', name: 'Me', bingos: 1, marked: 7, bestLine: 5, firstBingoSeq: 1 }];
    FakeSocket.last().serverSend({ ...FULL, game, standings });
    expect(snaps[0].standings).toEqual(standings);
    expect(tasksPerBoardOf(snaps[0].game)).toBe(24);
    expect(dealableFor(snaps[0].game, 's1')).toBe(6);
    expect(freeSpaceOf(snaps[0].game)).toBe(true);
    // A later frame without standings keeps the held copy.
    FakeSocket.last().serverSend({ t: 'state', rev: 4, view: [] });
    expect(snaps[1].standings).toEqual(standings);
  });

  it('act resolves with the ack result and rejects with details.code on a failed ack', async () => {
    const room = makeRoom();
    void room.hello();
    const sock = FakeSocket.last();
    await handshake(sock);
    const ok = room.act<{ taskId: string }>('addTask', { taskId: 'x', text: 'hi' });
    const bad = room.act('addTask', { taskId: 'y', text: '@Bob' });
    const [a, b] = sock.frames().slice(1) as Array<{ t: string; id: string; op: string; args: unknown }>;
    expect(a).toMatchObject({ t: 'act', op: 'addTask', args: { taskId: 'x', text: 'hi' } });
    sock.serverSend({ t: 'ack', id: b.id, ok: false, code: 'unknown-mention', details: { token: '@Bob' } });
    sock.serverSend({ t: 'ack', id: a.id, ok: true, result: { taskId: 'x' } });
    await expect(ok).resolves.toEqual({ taskId: 'x' });
    const err = await bad.catch((e: unknown) => e);
    expect(appErrorCode(err)).toBe('unknown-mention');
    expect((err as { details: { token: string } }).details.token).toBe('@Bob');
  });

  it('a state frame with an older rev is ignored', async () => {
    const room = makeRoom();
    const snaps: GameSnapshot[] = [];
    room.onSnapshot((s) => snaps.push(s));
    const sock = FakeSocket.last();
    await handshake(sock);
    sock.serverSend(FULL);
    sock.serverSend({ t: 'state', rev: 5, view: [] });
    sock.serverSend({ t: 'state', rev: 4, view: VIEW });
    sock.serverSend({ t: 'state', rev: 5, view: VIEW });
    expect(snaps).toHaveLength(2);
    expect(snaps[1].view).toEqual([]);
  });

  it('on close, an in-flight act rejects with offline; a queued act is sent after reconnect', async () => {
    const room = makeRoom();
    room.onSnapshot(() => {});
    const first = FakeSocket.last();
    await handshake(first);
    const inFlight = room.act('mark', { cellIndex: 1, marked: true });
    first.serverClose(1006);
    await expect(inFlight).rejects.toSatisfy((e: unknown) => appErrorCode(e) === 'offline');
    const queued = room.act('mark', { cellIndex: 2, marked: true });
    await vi.advanceTimersByTimeAsync(500);
    const second = FakeSocket.last();
    expect(second).not.toBe(first);
    await handshake(second);
    const sent = second.frames().find((f) => f.t === 'act') as { id: string; args: unknown };
    expect(sent.args).toEqual({ cellIndex: 2, marked: true });
    second.serverSend({ t: 'ack', id: sent.id, ok: true, result: { marks: [] } });
    await expect(queued).resolves.toEqual({ marks: [] });
  });

  it('a queued act that never goes out rejects with offline after 10 s', async () => {
    const room = makeRoom({ url: 'ws://down' });
    const queued = room.act('launch', {}).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(appErrorCode(await queued)).toBe('offline');
  });

  it('reconnect backs off 500, 1000, 2000 ms and re-sends hello with the gameId', async () => {
    const room = makeRoom();
    room.onSnapshot(() => {});
    void room.hello('g1');
    expect(FakeSocket.instances).toHaveLength(1);
    FakeSocket.last().serverClose(1006);
    for (const delay of [500, 1000, 2000]) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      const before = FakeSocket.instances.length;
      await vi.advanceTimersByTimeAsync(1);
      expect(FakeSocket.instances.length).toBe(before + 1);
      if (delay < 2000) FakeSocket.last().serverClose(1006);
    }
    const sock = FakeSocket.last();
    sock.open();
    await flush();
    expect(sock.frames()[0]).toEqual({ t: 'hello', token: 'tok', gameId: 'g1' });
  });

  it('close 4003 calls onFatal with permission-denied and does not reconnect', async () => {
    const room = makeRoom();
    room.onSnapshot(() => {});
    const fatal = vi.fn();
    room.onFatal(fatal);
    const sock = FakeSocket.last();
    await handshake(sock);
    sock.serverSend({ t: 'evicted', reason: 'replaced' });
    sock.serverClose(4003);
    expect(fatal).toHaveBeenCalledTimes(1);
    const err = fatal.mock.calls[0][0] as { code: string };
    expect(appErrorCode(err)).toBe('permission-denied');
    expect(err.code).toBe('permission-denied');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(room.status).toBe('closed');
  });

  it('missing pong for 10 s closes and reconnects', async () => {
    const room = makeRoom();
    room.onSnapshot(() => {});
    const sock = FakeSocket.last();
    await handshake(sock);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(sock.sent.filter((s) => s === 'ping')).toHaveLength(1);
    sock.serverSend('pong');
    await vi.advanceTimersByTimeAsync(25_000);
    expect(sock.sent.filter((s) => s === 'ping')).toHaveLength(2);
    expect(sock.closeCalls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sock.closeCalls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('a wake while ready probes at once and reconnects when no pong comes within 3 s', async () => {
    const room = makeRoom();
    room.onSnapshot(() => {});
    const sock = FakeSocket.last();
    await handshake(sock);
    // A live socket answers the probe and stays.
    document.dispatchEvent(new Event('visibilitychange'));
    expect(sock.sent.filter((s) => s === 'ping')).toHaveLength(1);
    sock.serverSend('pong');
    await vi.advanceTimersByTimeAsync(3_000);
    expect(sock.closeCalls).toHaveLength(0);
    // A socket that died while the phone slept never answers: dropped after 3 s, then a reconnect.
    window.dispatchEvent(new Event('online'));
    expect(sock.sent.filter((s) => s === 'ping')).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2_999);
    expect(sock.closeCalls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(sock.closeCalls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(500);
    // Rooms left open by earlier tests also hear the events; count only this room's sockets.
    expect(FakeSocket.instances.filter((s) => s.url === sock.url)).toHaveLength(2);
    room.close();
  });

  it('no welcome within 10 s abandons and reconnects', async () => {
    const room = makeRoom();
    room.onSnapshot(() => {});
    const first = FakeSocket.last();
    await handshake(first, WELCOME);
    first.serverSend(FULL);
    first.serverSend({ t: 'state', rev: 7, view: [] });
    first.serverClose(1006);
    await vi.advanceTimersByTimeAsync(500);
    const second = FakeSocket.last();
    // Opens and says hello, but the welcome never comes.
    second.open();
    await flush();
    await vi.advanceTimersByTimeAsync(5_000);
    const queued = room.act('mark', { cellIndex: 1, marked: true });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(second.closeCalls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(second.closeCalls).toHaveLength(1);
    expect(room.status).toBe('connecting');
    // The queued act survives the abandon and goes out on the next socket's welcome (second backoff step).
    await vi.advanceTimersByTimeAsync(1_000);
    const sockets = FakeSocket.instances.filter((s) => s.url === first.url);
    expect(sockets).toHaveLength(3);
    const snaps: GameSnapshot[] = [];
    room.onSnapshot((s) => snaps.push(s));
    await handshake(sockets[2]);
    const sent = sockets[2].frames().find((f) => f.t === 'act') as { id: string };
    expect(sent).toBeDefined();
    sockets[2].serverSend({ t: 'ack', id: sent.id, ok: true, result: {} });
    await expect(queued).resolves.toEqual({});
    // The welcome reset the rev: a frame older than the last socket's is applied.
    sockets[2].serverSend({ t: 'state', rev: 4, view: VIEW });
    expect(snaps.at(-1)?.view).toEqual(VIEW);
    room.close();
  });

  it('a wake during a stalled connect abandons it and reconnects at once', async () => {
    const room = makeRoom();
    room.onSnapshot(() => {});
    const first = FakeSocket.last();
    await handshake(first);
    const inFlight = room.act('mark', { cellIndex: 1, marked: true });
    first.serverClose(1006);
    await expect(inFlight).rejects.toSatisfy((e: unknown) => appErrorCode(e) === 'offline');
    await vi.advanceTimersByTimeAsync(500);
    const second = FakeSocket.last();
    second.open();
    await flush();
    const queued = room.act('mark', { cellIndex: 2, marked: true });
    // A wake soon after the socket opened leaves it alone.
    window.dispatchEvent(new Event('online'));
    expect(second.closeCalls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(3_000);
    window.dispatchEvent(new Event('online'));
    expect(second.closeCalls).toHaveLength(1);
    const sockets = FakeSocket.instances.filter((s) => s.url === first.url);
    expect(sockets).toHaveLength(3);
    await handshake(sockets[2]);
    const sent = sockets[2].frames().find((f) => f.t === 'act') as { id: string; args: unknown };
    expect(sent.args).toEqual({ cellIndex: 2, marked: true });
    sockets[2].serverSend({ t: 'ack', id: sent.id, ok: true, result: {} });
    await expect(queued).resolves.toEqual({});
    room.close();
  });

  it('a close with reason superseded parks the room until something needs it again', async () => {
    const room = makeRoom();
    room.onSnapshot(() => {});
    const fatal = vi.fn();
    room.onFatal(fatal);
    const first = FakeSocket.last();
    await handshake(first);
    first.serverClose(1000, 'superseded');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(fatal).not.toHaveBeenCalled();
    expect(room.status).toBe('idle');
    // A user action (or a wake) reopens it.
    const act = room.act('mark', { cellIndex: 0, marked: true });
    expect(FakeSocket.instances).toHaveLength(2);
    const second = FakeSocket.last();
    await handshake(second);
    const sent = second.frames().find((f) => f.t === 'act') as { id: string };
    second.serverSend({ t: 'ack', id: sent.id, ok: true, result: {} });
    await expect(act).resolves.toEqual({});
  });

  it('error try-again then close 1013 reconnects and the waiting hello resolves on the next welcome', async () => {
    const room = makeRoom();
    const hello = room.hello('g1');
    const first = FakeSocket.last();
    first.open();
    await flush();
    first.serverSend({ t: 'error', code: 'try-again' });
    first.serverClose(1013, 'try-again');
    await vi.advanceTimersByTimeAsync(500);
    const second = FakeSocket.last();
    expect(second).not.toBe(first);
    await handshake(second);
    await expect(hello).resolves.toMatchObject({ gameId: 'g1' });
  });

  it('reconnect welcome with seatId null after a seat fires permission-denied', async () => {
    const room = makeRoom();
    room.onSnapshot(() => {});
    const fatal = vi.fn();
    room.onFatal(fatal);
    const first = FakeSocket.last();
    await handshake(first);
    first.serverClose(1006);
    await vi.advanceTimersByTimeAsync(500);
    const second = FakeSocket.last();
    await handshake(second, { ...WELCOME, seatId: null });
    expect(fatal).toHaveBeenCalledTimes(1);
    expect(appErrorCode(fatal.mock.calls[0][0])).toBe('permission-denied');
    expect(second.closeCalls).toHaveLength(1);
    expect(room.status).toBe('closed');
  });

  it('reconnect welcome with a seat notifies pending reclaim watchers approved', async () => {
    const room = makeRoom();
    const statuses: string[] = [];
    room.onReclaim('r1', (s) => statuses.push(s));
    const first = FakeSocket.last();
    await handshake(first, { ...WELCOME, seatId: null });
    expect(statuses).toEqual([]);
    first.serverClose(1006);
    await vi.advanceTimersByTimeAsync(500);
    await handshake(FakeSocket.last());
    expect(statuses).toEqual(['approved']);
  });

  it('a welcome for a different game clears the old sections, even when that game was requested', async () => {
    const room = makeRoom();
    const snaps: GameSnapshot[] = [];
    room.onSnapshot((s) => snaps.push(s));
    const sock = FakeSocket.last();
    await handshake(sock);
    sock.serverSend(FULL);
    expect(snaps).toHaveLength(1);
    const again = room.hello('g2');
    await flush();
    sock.serverSend({ ...WELCOME, gameId: 'g2', rev: 0 });
    await again;
    // Only a view arrives for g2: nothing of g1 may complete the snapshot.
    sock.serverSend({ t: 'state', rev: 1, view: [] });
    expect(snaps).toHaveLength(1);
  });

  it('getRoom returns the same connection for the same code', () => {
    const opts = { url: 'ws://srv', code: 'SAME1', getToken: async () => 'tok', WebSocketImpl: FakeSocket as unknown as typeof WebSocket };
    const a = getRoom(opts);
    expect(getRoom(opts)).toBe(a);
    expect(getRoom({ ...opts, code: 'OTHER' })).not.toBe(a);
    a.close();
    expect(getRoom(opts)).not.toBe(a);
  });
});
