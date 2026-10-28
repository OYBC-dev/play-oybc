import { SELF } from 'cloudflare:test';
import type { AckMsg, ClientMsg, Op, ServerMsg, StateMsg } from '../src/protocol';

const b64url = (o: unknown): string => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** An unsigned JWT: base64url header + payload and an empty signature. */
export function unsignedJwt(payload: Record<string, unknown>): string {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.`;
}

/** An emulator-mode ID token for `uid` against the test project. */
export function tokenFor(uid: string): string {
  return unsignedJwt({ sub: uid, aud: 'demo-play-oybc', iss: 'https://securetoken.google.com/demo-play-oybc' });
}

/** A fresh client IP per call so the per-IP rate limits never couple unrelated tests. */
export function randomIp(): string {
  const b = crypto.getRandomValues(new Uint8Array(4));
  return `10.${b[1]}.${b[2]}.${b[3]}`;
}

/** POSTs `/api/createGame` as `uid`; returns the parsed 200 body (throws on any other status). */
export async function createGame(uid: string, name: string): Promise<{ gameId: string; code: string; seatId: string }> {
  const res = await SELF.fetch('https://api.test/api/createGame', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenFor(uid)}`, 'Content-Type': 'application/json', 'CF-Connecting-IP': randomIp() },
    body: JSON.stringify({ name }),
  });
  if (res.status !== 200) throw new Error(`createGame ${res.status}: ${await res.text()}`);
  return res.json();
}

type Frame = ServerMsg;

/** A test-side WebSocket that records every frame and its close. */
export interface WsClient {
  readonly frames: Frame[];
  /** Resolves with the close code once the server closes the socket. */
  readonly closed: Promise<number>;
  send(raw: string | object): void;
  /** Sends `hello` and resolves with the first `welcome` or `error` frame after it. */
  hello(token: string, gameId?: string): Promise<Frame>;
  /** Sends an `act` and resolves with its `ack`. */
  act(op: Op, args?: Record<string, unknown>): Promise<AckMsg>;
  /** Resolves with the first frame at index ≥ `from` matching `pred`; rejects after `ms`. */
  waitFor<T extends Frame = Frame>(pred: (f: Frame) => boolean, from?: number, ms?: number): Promise<T>;
  /** Frames received at index ≥ `from`. */
  since(from: number): Frame[];
  /**
   * Round-trips a harmless failing act so every push sent to this socket before it has arrived
   * (frames on one socket are ordered and the object handles messages one at a time).
   */
  sync(): Promise<void>;
  close(): void;
}

let actSeq = 0;

/** Opens `/ws/<code>` through the Worker without saying hello. */
export async function connect(code: string): Promise<WsClient> {
  const res = await SELF.fetch(`https://api.test/ws/${code}`, { headers: { Upgrade: 'websocket', 'CF-Connecting-IP': randomIp() } });
  const ws = res.webSocket;
  if (!ws) throw new Error(`upgrade failed: ${res.status}`);
  ws.accept();
  const frames: Frame[] = [];
  const waiters = new Set<() => void>();
  let resolveClosed!: (code: number) => void;
  const closed = new Promise<number>((r) => { resolveClosed = r; });
  ws.addEventListener('message', (e) => {
    frames.push(JSON.parse(e.data as string) as Frame);
    for (const w of [...waiters]) w();
  });
  ws.addEventListener('close', (e) => { resolveClosed(e.code); for (const w of [...waiters]) w(); });

  const waitFor = <T extends Frame>(pred: (f: Frame) => boolean, from = 0, ms = 3000): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const check = (): boolean => {
        const hit = frames.slice(from).find(pred);
        if (hit) { waiters.delete(check); clearTimeout(timer); resolve(hit as T); return true; }
        return false;
      };
      const timer = setTimeout(() => { waiters.delete(check); reject(new Error(`timeout; frames: ${JSON.stringify(frames.slice(from))}`)); }, ms);
      if (!check()) waiters.add(check);
    });

  const client: WsClient = {
    frames,
    closed,
    send: (raw) => ws.send(typeof raw === 'string' ? raw : JSON.stringify(raw)),
    async hello(token, gameId) {
      const from = frames.length;
      const msg: ClientMsg = gameId ? { t: 'hello', token, gameId } : { t: 'hello', token };
      ws.send(JSON.stringify(msg));
      return waitFor((f) => f.t === 'welcome' || f.t === 'error', from);
    },
    async act(op, args = {}) {
      const id = `a${++actSeq}`;
      ws.send(JSON.stringify({ t: 'act', id, op, args } satisfies ClientMsg));
      return waitFor<AckMsg>((f) => f.t === 'ack' && f.id === id);
    },
    waitFor,
    since: (from) => frames.slice(from),
    async sync() { await client.act('deleteTask', { taskId: 'sync-probe' }); },
    close: () => ws.close(1000),
  };
  return client;
}

/** Opens a socket and says hello as `uid`; resolves once `welcome` (and, if seated, the full `state`) arrived. */
export async function wsClient(code: string, uid: string, gameId?: string): Promise<WsClient & { welcome: Extract<Frame, { t: 'welcome' }> }> {
  const c = await connect(code);
  const w = await c.hello(tokenFor(uid), gameId);
  if (w.t !== 'welcome') throw new Error(`hello failed: ${JSON.stringify(w)}`);
  if (w.seatId) await c.waitFor((f) => f.t === 'state');
  return Object.assign(c, { welcome: w });
}

/** Narrowing helper for state frames. */
export const isState = (f: Frame): f is StateMsg => f.t === 'state';
