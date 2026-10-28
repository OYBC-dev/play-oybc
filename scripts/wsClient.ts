/**
 * Shared WebSocket client for the operational scripts: opens `wss://<base>/ws/<CODE>`, authenticates with
 * `hello`, matches `ack`s to `act`s by id, and keeps every received frame plus the merged latest state.
 */
import { randomUUID } from 'node:crypto';

export const DEFAULT_API_URL = 'https://play-oybc-api.oybc.workers.dev';

/** Any frame the server sends (loosely typed; scripts only read a few fields). */
export type Frame = { t: string; [k: string]: any };
export type Ack = { ok: true; result: any } | { ok: false; code: string; details?: unknown };

export interface WsClient {
  /** The `welcome` frame (uid, gameId, seatId, stage, rev). */
  hello: Frame;
  /** Every frame received so far, in order. */
  frames: Frame[];
  /** Latest state: each pushed section replaces the previous one. */
  latest: Record<string, any>;
  /** Sends an action and resolves with its ack; rejects on timeout or close. */
  act: (op: string, args?: Record<string, unknown>, timeoutMs?: number) => Promise<Ack>;
  /** Closes the socket. */
  close: () => void;
}

/** Converts an https base URL to its wss equivalent. */
export const wsBase = (base: string): string => base.replace(/^http/, 'ws');

/**
 * Opens a socket for `code`, sends `hello` with `token`, and resolves after `welcome` and (if seated)
 * the first full `state`.
 * @throws Error on an `error` frame, an early close, or a 15 s timeout.
 */
export async function connect(base: string, code: string, token: string, gameId?: string): Promise<WsClient> {
  const ws = new WebSocket(`${wsBase(base)}/ws/${code}`);
  const frames: Frame[] = [];
  const latest: Record<string, any> = {};
  const pending = new Map<string, { res: (a: Ack) => void; rej: (e: Error) => void }>();
  let onFrame: (f: Frame) => void = () => {};
  ws.onmessage = (ev) => {
    const f = JSON.parse(String(ev.data)) as Frame;
    frames.push(f);
    if (f.t === 'state') for (const [k, v] of Object.entries(f)) if (k !== 't') latest[k] = v;
    if (f.t === 'ack') {
      const p = pending.get(f.id);
      if (p) { pending.delete(f.id); p.res(f.ok ? { ok: true, result: f.result } : { ok: false, code: f.code, details: f.details }); }
    }
    onFrame(f);
  };
  ws.onclose = (ev) => {
    for (const p of pending.values()) p.rej(new Error(`socket closed ${ev.code}`));
    pending.clear();
  };
  await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('socket error')); });

  const welcome = await new Promise<Frame>((res, rej) => {
    const timer = setTimeout(() => rej(new Error('hello timeout')), 15000);
    const prev = ws.onclose;
    ws.onclose = (ev) => { clearTimeout(timer); (prev as any)?.call(ws, ev); rej(new Error(`closed before welcome ${ev.code}`)); };
    onFrame = (f) => {
      if (f.t === 'welcome') { clearTimeout(timer); ws.onclose = prev; res(f); }
      else if (f.t === 'error') { clearTimeout(timer); rej(new Error(`hello rejected: ${f.code}`)); }
    };
    ws.send(JSON.stringify({ t: 'hello', token, ...(gameId ? { gameId } : {}) }));
  });
  if (welcome.seatId) {
    await new Promise<void>((res, rej) => {
      if (latest.game) return res();
      const timer = setTimeout(() => rej(new Error('first state timeout')), 15000);
      onFrame = (f) => { if (f.t === 'state') { clearTimeout(timer); res(); } };
    });
  }
  onFrame = () => {};

  return {
    hello: welcome, frames, latest,
    act: (op, args = {}, timeoutMs = 15000) => new Promise<Ack>((res, rej) => {
      const id = randomUUID();
      const timer = setTimeout(() => { pending.delete(id); rej(new Error(`ack timeout ${op}`)); }, timeoutMs);
      pending.set(id, { res: (a) => { clearTimeout(timer); res(a); }, rej: (e) => { clearTimeout(timer); rej(e); } });
      ws.send(JSON.stringify({ t: 'act', id, op, args }));
    }),
    close: () => ws.close(),
  };
}

/** Sleeps `ms` milliseconds. */
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
