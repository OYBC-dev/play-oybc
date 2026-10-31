import type { CreateGameRes, JoinGameRes, ToggleMarkRes, WhoAmIRes } from 'game-core';
import { ensureSignedIn } from '../firebase/session';
import type { GameClient } from './GameClient';
import { appError, getRoom, releaseRoom, type Op, type RoomConnection } from './roomConnection';

/** Injection points for tests; production uses the browser globals and the Firebase session. */
export interface WsClientDeps {
  getToken?: () => Promise<string>;
  WebSocketImpl?: typeof WebSocket;
  fetchImpl?: typeof fetch;
}

/** `sessionStorage` key remembering which room code a game lives in, so a reload can resubscribe. */
const codeKey = (gameId: string) => `play.codeFor.${gameId}`;

/**
 * GameClient over the game server: `createGame` is one HTTP POST, everything else runs on the game's
 * room socket (`getRoom`, one per code per tab). Ops address the room by code; the client keeps the
 * `gameId → code` map (memory + `sessionStorage`) from `createGame`, `joinGame` and `whoAmI`.
 * `subscribe`'s unsubscribe only detaches listeners — the room closes itself once idle.
 * @param url The server's WebSocket base URL (`ws://` or `wss://`); HTTP calls use the matching `http(s)://`.
 */
export function createWsGameClient(url: string, deps: WsClientDeps = {}): GameClient {
  const base = url.replace(/\/+$/, '');
  const httpUrl = base.replace(/^ws(s?):\/\//, 'http$1://');
  const getToken = deps.getToken ?? (async () => (await ensureSignedIn()).getIdToken());
  const codes = new Map<string, string>();

  const room = (code: string): RoomConnection =>
    getRoom({ url: base, code, getToken, WebSocketImpl: deps.WebSocketImpl });

  const remember = (gameId: string, code: string) => {
    codes.set(gameId, code);
    try { sessionStorage.setItem(codeKey(gameId), code); } catch { /* storage unavailable: memory still works */ }
  };

  const codeFor = (gameId: string): string | null => {
    const known = codes.get(gameId);
    if (known) return known;
    try { return sessionStorage.getItem(codeKey(gameId)); } catch { return null; }
  };

  /** Runs `op` on the room holding `gameId`. */
  const act = <T>(gameId: string, op: Op, args: Record<string, unknown>): Promise<T> => {
    const code = codeFor(gameId);
    if (!code) return Promise.reject(appError('game-not-found'));
    return room(code).act<T>(op, args);
  };

  return {
    async createGame(name) {
      const token = await getToken();
      let res: Response;
      try {
        res = await (deps.fetchImpl ?? fetch)(`${httpUrl}/api/createGame`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name }),
        });
      } catch {
        throw appError('offline');
      }
      const body = (await res.json().catch(() => ({}))) as Partial<CreateGameRes> & { code?: unknown };
      if (!res.ok) throw appError(typeof body.code === 'string' ? body.code : 'unknown');
      const out = body as CreateGameRes;
      remember(out.gameId, out.code);
      return out;
    },

    async joinGame(code, name) {
      const res = await room(code).act<JoinGameRes>('join', { name });
      remember(res.gameId, code);
      return res;
    },

    async whoAmI(code): Promise<WhoAmIRes> {
      const w = await room(code).hello();
      remember(w.gameId, code);
      return w.seatId ? { gameId: w.gameId, seatId: w.seatId } : null;
    },

    subscribe(gameId, _seatId, onChange, onError) {
      const code = codeFor(gameId);
      if (!code) {
        queueMicrotask(() => onError(appError('game-not-found')));
        return () => {};
      }
      const r = room(code);
      const offFatal = r.onFatal(onError);
      // A reload that skipped whoAmI: tell the room which game to say hello to (a mismatch ends it 4004).
      if (r.gameId !== gameId) r.hello(gameId).catch(() => { /* surfaced through onFatal */ });
      const offSnapshot = r.onSnapshot(onChange);
      return () => {
        offSnapshot();
        offFatal();
      };
    },

    async addTask(gameId, text, taskId = crypto.randomUUID()) {
      await act(gameId, 'addTask', { taskId, text });
    },
    async deleteTask(gameId, taskId) { await act(gameId, 'deleteTask', { taskId }); },
    async launch(gameId) { await act(gameId, 'launch', {}); },
    async setOptions(gameId, { freeSpace }) { await act(gameId, 'setOptions', { freeSpace }); },
    toggleMark: (gameId, cellIndex, marked) => act<ToggleMarkRes>(gameId, 'mark', { cellIndex, marked }),
    async end(gameId) { await act(gameId, 'end', {}); },
    async resolveReclaim(gameId, reclaimId, approve) { await act(gameId, 'resolveReclaim', { reclaimId, approve }); },
    async transferHost(gameId, toSeatId) { await act(gameId, 'transferHost', { toSeatId }); },

    watchReclaim(gameId, reclaimId, onStatus, onError) {
      const code = codeFor(gameId);
      if (!code) {
        queueMicrotask(() => onError?.(appError('game-not-found')));
        return () => {};
      }
      const r = room(code);
      const offFatal = onError ? r.onFatal(onError) : () => {};
      const offStatus = r.onReclaim(reclaimId, onStatus);
      return () => {
        offStatus();
        offFatal();
      };
    },

    leave(gameId) {
      const code = codeFor(gameId);
      if (code) releaseRoom(code);
    },
  };
}
