import { CLOSE, type Section, type ServerMsg } from '../protocol';
import type { Push } from './ops';
import { ALL_SECTIONS, buildSections } from './sections';
import type { GameState } from './state';

/** What a socket carries across hibernation once `hello` succeeded. */
export interface Attachment { uid: string; seatId: string | null }

/** The socket's attachment, or null before a successful `hello`. */
export function attachmentOf(ws: WebSocket): Attachment | null {
  return (ws.deserializeAttachment() as Attachment | null) ?? null;
}

/** Sends one server message as a JSON text frame; a socket already closing is skipped (sending would throw). */
export function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === WebSocket.READY_STATE_OPEN) ws.send(JSON.stringify(msg));
}

/** Every socket that said `hello` as `uid`. */
export function socketsFor(ctx: DurableObjectState, uid: string): WebSocket[] {
  return ctx.getWebSockets().filter((ws) => attachmentOf(ws)?.uid === uid);
}

/**
 * Delivers a push. Evicted uids' sockets get `evicted` and close 4003. Every other attached socket has its
 * seat re-resolved from `state.members` (re-serializing a changed attachment) and receives `push.all` ∪
 * `push.perSeat[seat]`, or every section when its seat just changed (a join or an approved reclaim).
 * Reclaim notices then go to each requester's sockets. Sockets that never said `hello` receive nothing.
 * @param rev The game's `rev` after the operation.
 */
export function broadcast(ctx: DurableObjectState, state: GameState, push: Push, rev: number): void {
  const evicted = new Set(push.evictUids ?? []);
  for (const ws of ctx.getWebSockets()) {
    const a = attachmentOf(ws);
    if (!a) continue;
    if (evicted.has(a.uid)) {
      ws.serializeAttachment(null);
      send(ws, { t: 'evicted', reason: 'replaced' });
      ws.close(CLOSE.EVICTED, 'evicted');
      continue;
    }
    const seatId = state.seatOf(a.uid);
    let sections: readonly Section[];
    if (seatId !== a.seatId) {
      ws.serializeAttachment({ uid: a.uid, seatId } satisfies Attachment);
      sections = ALL_SECTIONS;
    } else {
      sections = [...new Set([...push.all, ...(seatId ? push.perSeat?.[seatId] ?? [] : [])])];
    }
    if (sections.length === 0) continue;
    send(ws, { t: 'state', rev, ...buildSections(state, seatId, sections) });
  }
  for (const n of push.reclaimNotify ?? []) {
    for (const ws of socketsFor(ctx, n.uid)) send(ws, { t: 'reclaim', id: n.id, status: n.status });
  }
}
