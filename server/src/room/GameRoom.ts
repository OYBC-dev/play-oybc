import { verifyIdToken } from '../auth';
import { AppError, toAck } from '../errors';
import type { Env } from '../index';
import { CLOSE, MAX_FRAME_BYTES, type ClientMsg } from '../protocol';
import { MAX_SOCKETS, TokenBucket } from './limits';
import { OPS, adminSeats, adminTransferHost, claimGame, type OpCtx, type Push } from './ops';
import { SqlPersistence } from './persistence';
import { ALL_SECTIONS, buildSections } from './sections';
import { attachmentOf, broadcast, send, type Attachment } from './sockets';
import { GameState, type GameRow } from './state';

const DAY_MS = 24 * 60 * 60 * 1000;
/** An ended game is purged this long after `endedAt`. */
export const ENDED_TTL_MS = 7 * DAY_MS;
/** Any game is purged this long after its last mutation. */
export const IDLE_TTL_MS = 30 * DAY_MS;

/** The instant the game becomes purgeable: `endedAt + 7d` for an ended game, else (or if sooner) `lastMutationAt + 30d`. */
export function purgeAt(g: GameRow): number {
  const idle = g.lastMutationAt + IDLE_TTL_MS;
  return g.stage === 'ended' && g.endedAt !== undefined ? Math.min(g.endedAt + ENDED_TTL_MS, idle) : idle;
}

/** A JSON response. */
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** The `{code, details?}` body of an `AppError`. */
const errorBody = (e: AppError): Record<string, unknown> => (e.details ? { code: e.code, details: e.details } : { code: e.code });

/**
 * One game, keyed by join code: holds `GameState` in memory over its SQLite storage, accepts hibernatable
 * WebSockets, runs operations and pushes per-seat sections, and purges itself on an alarm.
 */
export class GameRoom implements DurableObject {
  private state!: GameState;
  /** Per-socket act limiter; in memory only (see `TokenBucket`). */
  private readonly buckets = new WeakMap<WebSocket, TokenBucket>();

  constructor(private readonly ctx: DurableObjectState, private readonly env: Env) {
    void ctx.blockConcurrencyWhile(async () => {
      this.state = new GameState(new SqlPersistence(ctx.storage.sql));
    });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  /** Upgrades a WebSocket, or serves the Worker-only `/internal/*` routes. */
  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return json({ code: 'resource-exhausted' }, 429);
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    const { pathname } = new URL(req.url);
    try {
      if (req.method === 'POST' && pathname === '/internal/claim') return await this.claim(req);
      if (req.method === 'GET' && pathname === '/internal/admin/seats') {
        if (!this.state.game) throw new AppError('game-not-found');
        return json(adminSeats(this.state));
      }
      if (req.method === 'POST' && pathname === '/internal/admin/transferHost') {
        const { seatId } = (await req.json()) as { seatId: string };
        const out = adminTransferHost(this.state, { now: Date.now() }, { seatId });
        await this.afterMutation(out.push);
        return json(out.result);
      }
    } catch (e) {
      if (e instanceof AppError) return json(errorBody(e), e.code === 'game-not-found' ? 404 : 400);
      if (e instanceof SyntaxError) return json({ code: 'invalid-argument' }, 400);
      throw e;
    }
    return new Response('not found', { status: 404 });
  }

  /**
   * Creates the game on this (empty) room. A room that already holds a game answers 409 so the Worker retries
   * with a new code; any other `AppError` is 400 `{code}`.
   */
  private async claim(req: Request): Promise<Response> {
    const { gameId, code, uid, name } = (await req.json()) as { gameId: string; code: string; uid: string; name: string };
    const t0 = Date.now();
    try {
      const out = claimGame(this.state, this.opCtx(uid), { gameId, code, name });
      this.log('createGame', 'ok', t0);
      await this.afterMutation(out.push);
      return json({ seatId: out.result.seatId });
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      this.log('createGame', e.code, t0);
      return json(errorBody(e), e.code === 'resource-exhausted' ? 409 : 400);
    }
  }

  /** Purges a game past its deadline (closing every socket 4004), else re-arms for that deadline. */
  async alarm(): Promise<void> {
    const g = this.state.game;
    if (!g) return;
    const due = purgeAt(g);
    if (Date.now() < due) {
      await this.ctx.storage.setAlarm(due);
      return;
    }
    this.state.purge();
    for (const ws of this.ctx.getWebSockets()) {
      if (attachmentOf(ws)) send(ws, { t: 'error', code: 'game-not-found' });
      ws.close(CLOSE.NOT_FOUND, 'game-not-found');
    }
  }

  /** Dispatches one client frame: size and shape checks, then `hello` or `act`. */
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (ws.readyState !== WebSocket.READY_STATE_OPEN) return; // frames queued behind a close we already sent
    const size = typeof raw === 'string' ? new TextEncoder().encode(raw).byteLength : raw.byteLength;
    if (size > MAX_FRAME_BYTES) {
      ws.close(CLOSE.TOO_LARGE, 'too-large');
      return;
    }
    let msg: ClientMsg;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)) as ClientMsg;
      if (!msg || typeof msg !== 'object') throw new SyntaxError('not an object');
    } catch {
      send(ws, { t: 'error', code: 'invalid-argument' });
      if (!attachmentOf(ws)) ws.close(CLOSE.BAD_TOKEN, 'hello-required');
      return;
    }
    if (msg.t === 'hello') return this.hello(ws, msg);
    const who = attachmentOf(ws);
    if (!who) {
      ws.close(CLOSE.BAD_TOKEN, 'hello-required');
      return;
    }
    if (msg.t !== 'act') {
      send(ws, { t: 'error', code: 'invalid-argument' });
      return;
    }
    let bucket = this.buckets.get(ws);
    if (!bucket) this.buckets.set(ws, (bucket = new TokenBucket()));
    if (!bucket.take()) {
      ws.close(CLOSE.RATE_LIMITED, 'rate-limited');
      return;
    }
    await this.act(ws, who.uid, msg);
  }

  /** Verifies the token, checks the game epoch, attaches `{uid, seatId}` and answers `welcome` (+ full `state` if seated). */
  private async hello(ws: WebSocket, msg: Extract<ClientMsg, { t: 'hello' }>): Promise<void> {
    let uid: string;
    try {
      ({ uid } = await verifyIdToken(typeof msg.token === 'string' ? msg.token : '', this.env));
    } catch {
      ws.serializeAttachment(null);
      send(ws, { t: 'error', code: 'unauthenticated' });
      ws.close(CLOSE.BAD_TOKEN, 'unauthenticated');
      return;
    }
    const game = this.state.game;
    if (!game || (msg.gameId !== undefined && msg.gameId !== game.gameId)) {
      ws.serializeAttachment(null);
      send(ws, { t: 'error', code: 'game-not-found' });
      ws.close(CLOSE.NOT_FOUND, 'game-not-found');
      return;
    }
    const seatId = this.state.seatOf(uid);
    ws.serializeAttachment({ uid, seatId } satisfies Attachment);
    send(ws, { t: 'welcome', uid, gameId: game.gameId, seatId, stage: game.stage, rev: game.rev });
    if (seatId) send(ws, { t: 'state', rev: game.rev, ...buildSections(this.state, seatId, ALL_SECTIONS) });
  }

  /**
   * Runs one operation and answers exactly one `ack`. On success: ack, then broadcast. On an `AppError` carrying
   * a push (state committed before the throw): broadcast first, then the failed ack. Writes are never rolled back.
   */
  private async act(ws: WebSocket, uid: string, msg: Extract<ClientMsg, { t: 'act' }>): Promise<void> {
    if (typeof msg.id !== 'string' || !msg.id) {
      send(ws, { t: 'error', code: 'invalid-argument' });
      return;
    }
    const t0 = Date.now();
    const handler = typeof msg.op === 'string' && Object.hasOwn(OPS, msg.op) ? OPS[msg.op] : undefined;
    const args = msg.args && typeof msg.args === 'object' && !Array.isArray(msg.args) ? msg.args : null;
    if (!handler || !args) {
      this.log(handler ? msg.op : 'unknown-op', 'invalid-argument', t0);
      send(ws, toAck(msg.id, new AppError('invalid-argument')));
      return;
    }
    try {
      const out = handler(this.state, this.opCtx(uid), args);
      this.log(msg.op, 'ok', t0);
      send(ws, { t: 'ack', id: msg.id, ok: true, result: out.result });
      await this.afterMutation(out.push);
    } catch (e) {
      this.log(msg.op, e instanceof AppError ? e.code : 'unknown', t0);
      if (e instanceof AppError && e.push) await this.afterMutation(e.push);
      send(ws, toAck(msg.id, e));
    }
  }

  /** Broadcasts a push and re-arms the purge alarm for the game's current deadline. */
  private async afterMutation(push: Push): Promise<void> {
    const g = this.state.game;
    if (!g) return;
    broadcast(this.ctx, this.state, push, g.rev);
    await this.ctx.storage.setAlarm(purgeAt(g));
  }

  /** The only sources of time, randomness and ids an operation sees. */
  private opCtx(uid: string): OpCtx {
    return { uid, now: Date.now(), rng: Math.random, newId: () => crypto.randomUUID() };
  }

  /** One structured line per action (spec §9); never names, task text or tokens. */
  private log(op: string, code: string, t0: number): void {
    console.log(JSON.stringify({ op, code, gameCode: this.state.game?.code ?? null, ms: Date.now() - t0, seats: this.state.seats.size }));
  }

  /** A closing client: complete the close handshake. */
  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try { ws.close(code, reason); } catch { /* reserved code or already closed */ }
  }

  /** A socket error: close it. */
  async webSocketError(ws: WebSocket): Promise<void> {
    try { ws.close(1011, 'error'); } catch { /* already closed */ }
  }
}
