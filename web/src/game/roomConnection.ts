import type { BingoDoc, BoardDoc, PoolViewEntry, ReclaimDoc, RosterName, Stage, Standing } from 'game-core';
import type { GameSnapshot } from './GameClient';

/*
 * Client half of the game server's WebSocket protocol. The message shapes mirror `server/src/protocol.ts`
 * (the contract); they are restated here because the web bundle may not import from `server/`.
 */

/** Operations a seat can run over `act`. */
export type Op = 'join' | 'leave' | 'addTask' | 'deleteTask' | 'launch' | 'mark' | 'end' | 'resolveReclaim' | 'transferHost' | 'setOptions'
  | 'bindName' | 'retireName';

/** The server's answer to `hello`. `seatId` is null when this uid holds no seat yet. */
export interface Welcome { uid: string; gameId: string; seatId: string | null; stage: Stage; rev: number; gameName?: string; hostName?: string }

interface StateMsg {
  t: 'state'; rev: number; game?: GameSnapshot['game']; seats?: GameSnapshot['seats']; view?: PoolViewEntry[];
  board?: BoardDoc | null; bingos?: BingoDoc[]; standings?: Standing[]; reclaims?: GameSnapshot['reclaims'];
  roster?: RosterName[];
}
type ServerMsg =
  | ({ t: 'welcome' } & Welcome)
  | StateMsg
  | { t: 'ack'; id: string; ok: true; result: unknown }
  | { t: 'ack'; id: string; ok: false; code: string; details?: Record<string, unknown> }
  | { t: 'reclaim'; id: string; status: ReclaimDoc['status'] }
  | { t: 'evicted'; reason: string }
  | { t: 'error'; code: string };

/** Close codes the server uses (`CLOSE` in the protocol). */
const CLOSE_BAD_TOKEN = 4001;
const CLOSE_EVICTED = 4003;
const CLOSE_NOT_FOUND = 4004;
/** Close codes that end the room for good, with the app error each one becomes. */
const FATAL_CLOSE: Record<number, string> = {
  [CLOSE_BAD_TOKEN]: 'unauthenticated',
  [CLOSE_EVICTED]: 'permission-denied',
  [CLOSE_NOT_FOUND]: 'game-not-found',
};

const BACKOFF_START_MS = 500;
const BACKOFF_MAX_MS = 8_000;
const BACKOFF_JITTER = 0.2;
const PING_EVERY_MS = 25_000;
const PONG_WITHIN_MS = 10_000;
/** How long a wake probe (`ping` on `visibilitychange` → visible / `online` while ready) waits for `pong`. */
export const WAKE_PONG_WITHIN_MS = 3_000;
/** Close reason the server gives a uid's oldest socket when a fifth one says hello: stay down, do not loop. */
const SUPERSEDED_REASON = 'superseded';
/** How long an act (or hello) may wait for a ready socket before it fails `offline`. */
const SEND_DEADLINE_MS = 10_000;
/** How long a socket may take from open to `welcome` before it is abandoned and retried. */
const CONNECT_DEADLINE_MS = 10_000;
/** A wake abandons a socket that has been handshaking at least this long. */
export const WAKE_STALL_MS = 3_000;
/** How long a room with no listeners and nothing pending stays open before it closes itself. */
export const IDLE_CLOSE_MS = 15_000;

/** The error shape the UI reads: `details.code` (see `appErrorCode`), plus `code` for listener-style checks. */
export type AppError = Error & { code: string; details: { code: string } & Record<string, unknown> };

/** Builds an app error carrying `code` (and any server `details`, e.g. a mention `token`). */
export function appError(code: string, details?: Record<string, unknown>): AppError {
  return Object.assign(new Error(code), { code, details: { ...details, code } });
}

export interface RoomOptions {
  /** Server base URL, `ws://` or `wss://`; the socket opens `<url>/ws/<code>`. */
  url: string;
  code: string;
  /** A fresh Firebase ID token for `hello`. */
  getToken: () => Promise<string>;
  WebSocketImpl?: typeof WebSocket;
  now?: () => number;
  setTimeoutImpl?: (fn: () => void, ms: number) => unknown;
  clearTimeoutImpl?: (handle: unknown) => void;
  /** Source of backoff jitter, in [0, 1). */
  random?: () => number;
}

export type RoomStatus = 'idle' | 'connecting' | 'authenticating' | 'ready' | 'closed';

interface Pending<T> { resolve: (v: T) => void; reject: (e: Error) => void; deadline: unknown }
interface QueuedAct extends Pending<unknown> { id: string; op: Op; args: Record<string, unknown> }
type Sections = Partial<Omit<GameSnapshot, 'mySeatId'>>;
/** The sections a `state` frame may carry; each present one replaces the held copy wholesale. */
const SECTION_KEYS = ['game', 'seats', 'view', 'board', 'bingos', 'standings', 'reclaims', 'roster'] as const;

/** Every live room by code: one socket per code per tab, however many components ask (StrictMode included). */
const rooms = new Map<string, RoomConnection>();

/** The room for `opts.code`, opening a new one only when none is live. */
export function getRoom(opts: RoomOptions): RoomConnection {
  const live = rooms.get(opts.code);
  if (live && live.status !== 'closed') return live;
  const room = new RoomConnection(opts);
  rooms.set(opts.code, room);
  return room;
}

/** Closes the live room for `code`, if any, and drops it from the registry; never opens one. */
export function releaseRoom(code: string): void {
  rooms.get(code)?.close();
}

/**
 * One reconnecting WebSocket to one game room. It says `hello` on every (re)connect with the last known
 * `gameId`, merges `state` frames section by section (dropping any whose `rev` is not newer than the last
 * applied; `welcome` resets that), and runs `act`s: sent at once when ready, else queued until the next
 * `welcome` (10 s from enqueue, then `offline`). A close rejects sent-but-unacked acts with `offline` and
 * reconnects with backoff (0.5 s doubling to 8 s, ±20 %), at once on `visibilitychange` → visible or `online`.
 * Closes 4001 / 4003 / 4004 are fatal: `onFatal` fires and the room stays closed. A `ping` goes out every
 * 25 s; no `pong` within 10 s drops the socket and reconnects. A socket with no `welcome` 10 s after it was
 * opened is dropped and retried the same way, and a wake drops one that has been handshaking for 3 s. A wake while ready (a phone unlocking onto
 * a socket that died while it slept) probes at once with a `ping` and a 3 s deadline. A close with reason
 * `superseded` (this uid opened too many sockets) parks the room: no automatic reconnect, so tabs cannot
 * evict each other in a loop; the next act, hello, listener or wake reopens it.
 *
 * Lifetime: the socket opens on first use (`hello`, `act`, `onSnapshot`, `onReclaim`). When no snapshot or
 * reclaim listener is attached and nothing is pending, the room closes itself after `IDLE_CLOSE_MS` — so a
 * page that leaves the game (its `subscribe` detached) releases the socket, while StrictMode's
 * unmount/remount and the JoinPage → GamePage hand-off reuse it. `close()` also ends it explicitly.
 */
export class RoomConnection {
  readonly code: string;
  private readonly opts: RoomOptions;
  private readonly WS: typeof WebSocket;
  private readonly setT: (fn: () => void, ms: number) => unknown;
  private readonly clearT: (handle: unknown) => void;
  private readonly random: () => number;
  private readonly now: () => number;

  private ws: WebSocket | null = null;
  private state: RoomStatus = 'idle';
  private epoch: string | undefined;
  /** The gameId of the last `welcome` (the epoch the merged sections belong to). */
  private welcomedGameId: string | undefined;
  private seatId: string | null = null;
  private lastRev = -1;
  private sections: Sections = {};
  private attempt = 0;

  private helloWaiters: Array<Pending<Welcome>> = [];
  private queue: QueuedAct[] = [];
  private inFlight = new Map<string, QueuedAct>();
  private nextId = 0;

  private snapshotListeners = new Set<(s: GameSnapshot) => void>();
  private reclaimListeners = new Map<string, Set<(s: ReclaimDoc['status']) => void>>();
  private fatalListeners = new Set<(e: Error) => void>();

  private reconnectTimer: unknown = null;
  private pingTimer: unknown = null;
  private pongTimer: unknown = null;
  private idleTimer: unknown = null;
  /** Abandons the current socket unless its `welcome` arrives first. */
  private connectTimer: unknown = null;
  /** When the current socket was opened (for the wake stall check). */
  private connectStartedAt = 0;
  /** The server superseded the last socket: reconnect only on demand, never by backoff. */
  private parked = false;
  private readonly wake = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (this.state === 'ready' && this.ws) {
      this.probe(this.ws);
      return;
    }
    if (this.ws) {
      // A handshake that has hung for a while: drop it, then reconnect at once below.
      if (this.now() - this.connectStartedAt < WAKE_STALL_MS) return;
      this.abandon(this.ws);
    }
    if (this.parked) {
      if (this.busy()) this.connect();
      return;
    }
    if (this.reconnectTimer === null) return;
    this.clearT(this.reconnectTimer);
    this.reconnectTimer = null;
    this.connect();
  };

  constructor(opts: RoomOptions) {
    this.opts = opts;
    this.code = opts.code;
    this.WS = opts.WebSocketImpl ?? WebSocket;
    this.setT = opts.setTimeoutImpl ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearT = opts.clearTimeoutImpl ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.random = opts.random ?? Math.random;
    this.now = opts.now ?? Date.now;
    if (typeof window !== 'undefined') window.addEventListener('online', this.wake);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.wake);
  }

  get status(): RoomStatus {
    return this.state;
  }

  /** The game this room last said hello to (the epoch), if any. */
  get gameId(): string | undefined {
    return this.epoch;
  }

  /**
   * Says `hello` (again, on an open socket — how a seat granted by an approved reclaim is picked up) and
   * resolves with the next `welcome`. Rejects with the server's `error` code (e.g. `game-not-found`), the
   * fatal close's code, or `offline` after 10 s without one.
   */
  hello(gameId?: string): Promise<Welcome> {
    if (gameId !== undefined) this.epoch = gameId;
    return new Promise<Welcome>((resolve, reject) => {
      if (this.state === 'closed') { reject(appError('offline')); return; }
      const waiter: Pending<Welcome> = {
        resolve, reject,
        deadline: this.setT(() => {
          this.helloWaiters = this.helloWaiters.filter((w) => w !== waiter);
          reject(appError('offline'));
          this.checkIdle();
        }, SEND_DEADLINE_MS),
      };
      this.helloWaiters.push(waiter);
      this.cancelIdle();
      if (this.state === 'ready') void this.sendHello();
      else this.connect();
    });
  }

  /** Runs `op`; resolves with the ack's result or rejects with its code (and details). */
  act<T>(op: Op, args: Record<string, unknown>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.state === 'closed') { reject(appError('offline')); return; }
      const entry: QueuedAct = {
        id: `a${++this.nextId}`, op, args, resolve: resolve as (v: unknown) => void, reject,
        deadline: this.setT(() => {
          this.queue = this.queue.filter((q) => q !== entry);
          reject(appError('offline'));
          this.checkIdle();
        }, SEND_DEADLINE_MS),
      };
      this.cancelIdle();
      if (this.state === 'ready') this.send(entry);
      else {
        this.queue.push(entry);
        this.connect();
      }
    });
  }

  /** Calls `cb` with every complete merged snapshot (at once if one is already held). */
  onSnapshot(cb: (s: GameSnapshot) => void): () => void {
    this.snapshotListeners.add(cb);
    this.cancelIdle();
    this.connect();
    const now = this.snapshot();
    if (now) cb(now);
    return () => {
      this.snapshotListeners.delete(cb);
      this.checkIdle();
    };
  }

  /** Calls `cb` with each status the server reports for reclaim `id`. */
  onReclaim(id: string, cb: (status: ReclaimDoc['status']) => void): () => void {
    let set = this.reclaimListeners.get(id);
    if (!set) this.reclaimListeners.set(id, (set = new Set()));
    set.add(cb);
    this.cancelIdle();
    this.connect();
    return () => {
      const s = this.reclaimListeners.get(id);
      s?.delete(cb);
      if (s?.size === 0) this.reclaimListeners.delete(id);
      this.checkIdle();
    };
  }

  /** Calls `cb` once if the room ends for good (evicted, game gone, bad token). */
  onFatal(cb: (e: Error) => void): () => void {
    this.fatalListeners.add(cb);
    return () => { this.fatalListeners.delete(cb); };
  }

  /** Ends the room: closes the socket, fails anything pending with `offline`, never reconnects. */
  close(): void {
    if (this.state === 'closed') return;
    this.shutdown(appError('offline'));
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      detach(ws);
      try { ws.close(1000); } catch { /* already closed */ }
    }
  }

  // ---- transport ----

  /** Opens a socket unless one is open, opening, or the room is closed. */
  private connect(): void {
    if (this.state === 'closed' || this.ws) return;
    if (this.reconnectTimer !== null) return;
    this.parked = false;
    const ws = new this.WS(`${this.opts.url.replace(/\/+$/, '')}/ws/${this.code}`);
    this.ws = ws;
    this.state = 'connecting';
    this.connectStartedAt = this.now();
    this.clearConnectDeadline();
    this.connectTimer = this.setT(() => {
      this.connectTimer = null;
      if (this.ws === ws && this.state !== 'ready') this.abandon(ws);
    }, CONNECT_DEADLINE_MS);
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.state = 'authenticating';
      void this.sendHello();
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (this.ws === ws) this.receive(ev.data);
    };
    ws.onclose = (ev: CloseEvent) => {
      if (this.ws === ws) this.dropped(ev.code, ev.reason);
    };
  }

  /** Fetches a token and sends `hello` with the epoch, if the same socket is still open. */
  private async sendHello(): Promise<void> {
    const ws = this.ws;
    let token: string;
    try {
      token = await this.opts.getToken();
    } catch {
      // No token (e.g. auth offline): fail waiting hellos, then retry the socket with backoff for queued acts.
      this.failHello(appError('unauthenticated'));
      if (ws && this.ws === ws) this.abandon(ws);
      return;
    }
    if (!ws || this.ws !== ws || ws.readyState !== this.WS.OPEN) return;
    ws.send(JSON.stringify(this.epoch === undefined ? { t: 'hello', token } : { t: 'hello', token, gameId: this.epoch }));
  }

  private send(entry: QueuedAct): void {
    this.clearT(entry.deadline);
    this.inFlight.set(entry.id, entry);
    this.ws!.send(JSON.stringify({ t: 'act', id: entry.id, op: entry.op, args: entry.args }));
  }

  /** The socket closed (or was abandoned): fail what was sent, then reconnect, park, or end. */
  private dropped(code: number, reason = ''): void {
    const ws = this.ws;
    this.ws = null;
    if (ws) detach(ws);
    this.stopPing();
    this.clearConnectDeadline();
    for (const entry of this.inFlight.values()) entry.reject(appError('offline'));
    this.inFlight.clear();
    const fatal = FATAL_CLOSE[code];
    if (fatal) {
      this.fail(appError(fatal));
      return;
    }
    if (!this.busy()) {
      // Nobody needs the room any more: end it instead of reconnecting.
      this.shutdown(appError('offline'));
      return;
    }
    if (reason === SUPERSEDED_REASON) {
      this.state = 'idle';
      this.parked = true;
      return;
    }
    this.state = 'connecting';
    const base = Math.min(BACKOFF_START_MS * 2 ** this.attempt, BACKOFF_MAX_MS);
    const delay = Math.round(base * (1 + (this.random() * 2 - 1) * BACKOFF_JITTER));
    this.attempt++;
    this.reconnectTimer = this.setT(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private receive(data: unknown): void {
    if (data === 'pong') {
      if (this.pongTimer !== null) this.clearT(this.pongTimer);
      this.pongTimer = null;
      return;
    }
    let msg: ServerMsg;
    try {
      msg = JSON.parse(String(data)) as ServerMsg;
    } catch {
      return;
    }
    switch (msg.t) {
      case 'welcome': return this.welcome(msg);
      case 'state': return this.applyState(msg);
      case 'ack': {
        const entry = this.inFlight.get(msg.id);
        if (!entry) return;
        this.inFlight.delete(msg.id);
        if (msg.ok) {
          this.noteJoin(entry.op, msg.result);
          entry.resolve(msg.result);
        } else {
          entry.reject(appError(msg.code, msg.details));
        }
        this.checkIdle();
        return;
      }
      case 'reclaim':
        this.reclaimListeners.get(msg.id)?.forEach((l) => l(msg.status));
        return;
      case 'error':
        // `try-again` (the server could not check the token just now) precedes a 1013 close and a reconnect,
        // so a waiting hello keeps waiting for that reconnect's welcome.
        if (msg.code === 'try-again') return;
        // Fatal errors are followed by their close; this only answers a waiting hello.
        this.failHello(appError(msg.code));
        return;
      case 'evicted':
        return; // the 4003 close that follows ends the room
    }
  }

  /**
   * Adopts a `welcome`. Seat changes that happened while this socket was away surface here, because the
   * server's `evicted` / `reclaim` notices only reach sockets open at the time: in the same game, a seat
   * that became null is an eviction (fatal `permission-denied`, as 4003), and a seat that appeared while a
   * reclaim is watched is that reclaim approved (only on a reconnect's own hello, not one a caller awaits).
   */
  private welcome(w: Welcome & { t: 'welcome' }): void {
    const sameGame = this.welcomedGameId === w.gameId;
    if (this.welcomedGameId !== undefined && !sameGame) this.sections = {};
    const prevSeat = sameGame ? this.seatId : null;
    this.welcomedGameId = w.gameId;
    this.epoch = w.gameId;
    this.seatId = w.seatId;
    this.lastRev = -1;
    this.attempt = 0;
    this.state = 'ready';
    this.clearConnectDeadline();
    const welcome: Welcome = {
      uid: w.uid, gameId: w.gameId, seatId: w.seatId, stage: w.stage, rev: w.rev,
      ...(w.gameName && { gameName: w.gameName }), ...(w.hostName && { hostName: w.hostName }),
    };
    const waiters = this.helloWaiters;
    this.helloWaiters = [];
    for (const h of waiters) {
      this.clearT(h.deadline);
      h.resolve(welcome);
    }
    if (prevSeat && !w.seatId) {
      this.fail(appError('permission-denied'));
      return;
    }
    if (sameGame && !prevSeat && w.seatId && waiters.length === 0) {
      for (const set of this.reclaimListeners.values()) set.forEach((l) => l('approved'));
    }
    const queued = this.queue;
    this.queue = [];
    queued.forEach((q) => this.send(q));
    this.startPing();
    this.checkIdle();
  }

  /** Ends the room for good with `err`: closes the socket, fails pending work, tells `onFatal` listeners. */
  private fail(err: Error): void {
    this.shutdown(err);
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      detach(ws);
      try { ws.close(1000); } catch { /* already closed */ }
    }
    this.fatalListeners.forEach((l) => l(err));
  }

  /** A successful `join` seats this uid: later snapshots are that seat's. */
  private noteJoin(op: Op, result: unknown): void {
    if (op !== 'join') return;
    const r = result as { status?: string; seatId?: string } | null;
    if (r && (r.status === 'joined' || r.status === 'resumed') && typeof r.seatId === 'string') this.seatId = r.seatId;
  }

  /** Replaces each section the frame carries, then emits if the snapshot is complete. */
  private applyState(msg: StateMsg): void {
    if (msg.rev <= this.lastRev) return;
    this.lastRev = msg.rev;
    for (const key of SECTION_KEYS) {
      if (msg[key] !== undefined) (this.sections as Record<string, unknown>)[key] = msg[key];
    }
    const snap = this.snapshot();
    if (snap) this.snapshotListeners.forEach((l) => l(snap));
  }

  /**
   * The merged snapshot once game, seats, view and bingos are known and this uid holds a seat;
   * `standings` and `roster` are not waited for (absent = `[]`).
   */
  private snapshot(): GameSnapshot | null {
    const { game, seats, view, board, bingos, standings, reclaims, roster } = this.sections;
    if (!this.seatId || !game || !seats || !view || !bingos) return null;
    return {
      game, mySeatId: this.seatId, seats, view, board: board ?? null, bingos, standings: standings ?? [], reclaims: reclaims ?? [], roster: roster ?? [],
    };
  }

  private failHello(e: Error): void {
    const waiters = this.helloWaiters;
    this.helloWaiters = [];
    for (const h of waiters) {
      this.clearT(h.deadline);
      h.reject(e);
    }
  }

  // ---- heartbeat ----

  /** Pings every 25 s on the current socket; a ping unanswered for 10 s abandons it. */
  private startPing(): void {
    this.stopPing();
    const ws = this.ws;
    if (!ws) return;
    const tick = () => {
      this.pingTimer = null;
      if (this.ws !== ws) return;
      try { ws.send('ping'); } catch { /* the close event follows */ }
      if (this.pongTimer === null) {
        this.pongTimer = this.setT(() => {
          this.pongTimer = null;
          if (this.ws === ws) this.abandon(ws);
        }, PONG_WITHIN_MS);
      }
      this.pingTimer = this.setT(tick, PING_EVERY_MS);
    };
    this.pingTimer = this.setT(tick, PING_EVERY_MS);
  }

  /** Pings `ws` now and abandons it unless `pong` arrives within `WAKE_PONG_WITHIN_MS`. */
  private probe(ws: WebSocket): void {
    try { ws.send('ping'); } catch { /* the close event follows */ }
    if (this.pongTimer !== null) this.clearT(this.pongTimer);
    this.pongTimer = this.setT(() => {
      this.pongTimer = null;
      if (this.ws === ws) this.abandon(ws);
    }, WAKE_PONG_WITHIN_MS);
  }

  /** A dead link may never deliver `close`: drop the socket ourselves and reconnect. */
  private abandon(ws: WebSocket): void {
    detach(ws);
    try { ws.close(); } catch { /* already closed */ }
    this.dropped(1006);
  }

  private clearConnectDeadline(): void {
    if (this.connectTimer !== null) this.clearT(this.connectTimer);
    this.connectTimer = null;
  }

  private stopPing(): void {
    if (this.pingTimer !== null) this.clearT(this.pingTimer);
    if (this.pongTimer !== null) this.clearT(this.pongTimer);
    this.pingTimer = null;
    this.pongTimer = null;
  }

  // ---- lifetime ----

  private busy(): boolean {
    return this.snapshotListeners.size > 0 || this.reclaimListeners.size > 0
      || this.helloWaiters.length > 0 || this.queue.length > 0 || this.inFlight.size > 0;
  }

  private cancelIdle(): void {
    if (this.idleTimer !== null) this.clearT(this.idleTimer);
    this.idleTimer = null;
  }

  /** Starts the idle-close grace period when nothing needs the room. */
  private checkIdle(): void {
    if (this.state === 'closed' || this.busy() || this.idleTimer !== null) return;
    this.idleTimer = this.setT(() => {
      this.idleTimer = null;
      if (!this.busy()) this.close();
    }, IDLE_CLOSE_MS);
  }

  /** Marks the room closed, fails everything pending with `err`, and stops every timer and listener. */
  private shutdown(err: Error): void {
    this.state = 'closed';
    if (rooms.get(this.code) === this) rooms.delete(this.code);
    this.stopPing();
    this.clearConnectDeadline();
    this.cancelIdle();
    if (this.reconnectTimer !== null) this.clearT(this.reconnectTimer);
    this.reconnectTimer = null;
    this.failHello(err);
    for (const q of this.queue) {
      this.clearT(q.deadline);
      q.reject(err);
    }
    this.queue = [];
    for (const entry of this.inFlight.values()) entry.reject(err);
    this.inFlight.clear();
    if (typeof window !== 'undefined') window.removeEventListener('online', this.wake);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.wake);
  }
}

/** Stops a socket from calling back into the room. */
function detach(ws: WebSocket): void {
  ws.onopen = null;
  ws.onmessage = null;
  ws.onclose = null;
}
