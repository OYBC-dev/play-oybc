import { generateGameCode } from 'game-core';
import { verifyIdToken } from './auth';
import { AppError } from './errors';

export { GameRoom } from './room/GameRoom';

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
  FIREBASE_PROJECT_ID: string;
  AUTH_MODE: 'firebase' | 'emulator';
  ADMIN_TOKEN?: string;
  /** Workers rate-limit binding: `createGame` 10/min per client IP. */
  CREATE_LIMITER: RateLimit;
  /** Workers rate-limit binding: `/ws` upgrades 600/min per client IP (a venue NAT puts a whole room behind one IP). */
  WS_LIMITER: RateLimit;
}

/** Codes as the Worker accepts them (after uppercasing); generated codes are a subset. */
const CODE_RE = /^[A-Z0-9]{5}$/;
/** Fresh codes tried before `createGame` gives up. */
const CLAIM_ATTEMPTS = 5;

/** Browser headers for `/api/*` (bearer-token auth, no cookies, so any origin is safe). */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

/** A JSON response; `cors` adds the browser headers `/api/*` needs. */
const json = (body: unknown, status = 200, cors = false): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...(cors ? CORS : {}) } });

const notFound = (): Response => new Response('not found', { status: 404 });

/** The uppercased code from a path segment, or null when malformed. */
function parseCode(segment: string): string | null {
  const code = segment.toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

/** The client IP the rate limits key on (always set by Cloudflare's edge). */
const clientIp = (req: Request): string => req.headers.get('CF-Connecting-IP') ?? 'unknown';

/** The room stub for a code. */
const roomFor = (env: Env, code: string): DurableObjectStub => env.GAME_ROOM.get(env.GAME_ROOM.idFromName(code));

/** The bearer token of a request, or null. */
function bearer(req: Request): string | null {
  const m = /^Bearer (.+)$/.exec(req.headers.get('Authorization') ?? '');
  return m ? m[1] : null;
}

/** Constant-time comparison (both sides hashed first, so length does not leak either). */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

/**
 * `POST /api/createGame {name}` with a Firebase bearer token: claims a fresh code on its room, retrying on a
 * taken code (409), and answers `{gameId, code, seatId}`; `401`/`400 {code}`/`429 {code:'resource-exhausted'}` otherwise,
 * or `503 {code:'try-again'}` when Google's signing keys could not be fetched.
 */
async function createGame(req: Request, env: Env): Promise<Response> {
  if (!(await env.CREATE_LIMITER.limit({ key: clientIp(req) })).success) return json({ code: 'resource-exhausted' }, 429, true);
  let uid: string;
  try {
    ({ uid } = await verifyIdToken(bearer(req) ?? '', env));
  } catch (e) {
    if (e instanceof AppError && e.code === 'try-again') return json({ code: 'try-again' }, 503, true);
    return json({ code: 'unauthenticated' }, 401, true);
  }
  let name: unknown;
  try {
    ({ name } = (await req.json()) as { name?: unknown });
  } catch {
    return json({ code: 'invalid-argument' }, 400, true);
  }
  if (typeof name !== 'string') return json({ code: 'invalid-name' }, 400, true);
  for (let i = 0; i < CLAIM_ATTEMPTS; i++) {
    const code = generateGameCode();
    const gameId = crypto.randomUUID();
    const res = await roomFor(env, code).fetch('https://room/internal/claim', {
      method: 'POST', body: JSON.stringify({ gameId, code, uid, name }),
    });
    if (res.status === 409) continue;
    if (res.status !== 200) return json(await res.json().catch(() => ({ code: 'unknown' })), res.status, true);
    const { seatId } = (await res.json()) as { seatId: string };
    return json({ gameId, code, seatId }, 200, true);
  }
  return json({ code: 'resource-exhausted' }, 429, true);
}

/** `GET /admin/:code/seats` and `POST /admin/:code/transferHost {seatId}`, gated on `ADMIN_TOKEN`. */
async function adminRoute(req: Request, env: Env, code: string, action: string): Promise<Response> {
  const token = bearer(req);
  if (!env.ADMIN_TOKEN || !token || !(await safeEqual(token, env.ADMIN_TOKEN))) return json({ code: 'unauthenticated' }, 401);
  const stub = roomFor(env, code);
  if (action === 'seats' && req.method === 'GET') return stub.fetch('https://room/internal/admin/seats');
  if (action === 'transferHost' && req.method === 'POST') {
    return stub.fetch('https://room/internal/admin/transferHost', { method: 'POST', body: await req.text() });
  }
  return notFound();
}

export default {
  /** Routes `/health`, `/api/createGame`, `/ws/:code` and `/admin/:code/*`; never reads or writes game state itself. */
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (req.method === 'GET' && pathname === '/health') return new Response('ok');

    if (pathname === '/api/createGame') {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (req.method === 'POST') {
        try {
          return await createGame(req, env);
        } catch (e) {
          const stack = e instanceof Error ? e.stack ?? e.message : String(e);
          console.error(JSON.stringify({ error: 'create-failed', op: 'createGame', stack }));
          return json({ code: 'unknown' }, 500, true);
        }
      }
    }

    const ws = /^\/ws\/([^/]+)$/.exec(pathname);
    if (ws && req.method === 'GET') {
      const code = parseCode(ws[1]);
      if (!code) return notFound();
      if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('expected websocket', { status: 426 });
      if (!(await env.WS_LIMITER.limit({ key: clientIp(req) })).success) return new Response('rate limited', { status: 429 });
      return roomFor(env, code).fetch(req);
    }

    const admin = /^\/admin\/([^/]+)\/(seats|transferHost)$/.exec(pathname);
    if (admin) {
      const code = parseCode(admin[1]);
      return code ? adminRoute(req, env, code, admin[2]) : notFound();
    }

    return notFound();
  },
} satisfies ExportedHandler<Env>;
