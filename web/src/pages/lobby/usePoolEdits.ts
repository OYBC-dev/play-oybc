import { useEffect, useRef, useState } from 'react';
import type { PoolViewEntry } from 'game-core';
import { errorMessage } from '../../game/errorMessages';
import type { GameClient } from '../../game/GameClient';

/** A pool row as the lobby shows it; `pending` marks one added here that the server has not shown yet. */
export type PoolRow = PoolViewEntry & { pending?: boolean };

interface PendingAdd { taskId: string; text: string; acked: boolean; viewAtAck: PoolViewEntry[] | null }

/**
 * Optimistic pool edits over the server's `view`. An add shows its row at once (`pending`) until a view
 * carries its `taskId` — or, once acked, until the next view (it was deleted meanwhile); a failed add drops
 * the row and rethrows for the composer's error line; retrying the same text reuses its `taskId`, so an add
 * that did land before an `offline` failure is not added twice. A delete hides its row at once and keeps it hidden
 * until a view drops it; a failed delete restores the row and sets `deleteError`.
 */
export function usePoolEdits(client: GameClient, gameId: string, view: PoolViewEntry[]) {
  const [adds, setAdds] = useState<readonly PendingAdd[]>([]);
  const [removing, setRemoving] = useState<ReadonlyMap<string, 'sent' | 'done'>>(new Map());
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const latestView = useRef(view);
  latestView.current = view;
  /** The taskId an unconfirmed text was sent with: a retry of the same text replays it (idempotent). */
  const idForText = useRef(new Map<string, string>());

  useEffect(() => {
    const ids = new Set(view.map((e) => e.taskId));
    setAdds((a) => {
      const keep = a.filter((x) => !ids.has(x.taskId) && !(x.acked && x.viewAtAck !== view));
      return keep.length === a.length ? a : keep;
    });
    setRemoving((r) => {
      const stale = [...r].filter(([id, phase]) => phase === 'done' && !ids.has(id));
      if (stale.length === 0) return r;
      const next = new Map(r);
      stale.forEach(([id]) => next.delete(id));
      return next;
    });
  }, [view]);

  const add = async (text: string): Promise<void> => {
    let taskId = idForText.current.get(text);
    if (!taskId) idForText.current.set(text, (taskId = crypto.randomUUID()));
    const id = taskId;
    setAdds((a) => [...a.filter((x) => x.taskId !== id), { taskId: id, text, acked: false, viewAtAck: null }]);
    try {
      await client.addTask(gameId, text, id);
    } catch (e) {
      setAdds((a) => a.filter((x) => x.taskId !== id));
      throw e;
    }
    idForText.current.delete(text);
    const seen = latestView.current;
    setAdds((a) => a.map((x) => (x.taskId === id ? { ...x, acked: true, viewAtAck: seen } : x)));
  };

  const remove = async (taskId: string): Promise<void> => {
    setDeleteError(null);
    setRemoving((r) => new Map(r).set(taskId, 'sent'));
    try {
      await client.deleteTask(gameId, taskId);
      setRemoving((r) => (r.has(taskId) ? new Map(r).set(taskId, 'done') : r));
    } catch (e) {
      setDeleteError(errorMessage(e));
      setRemoving((r) => { const n = new Map(r); n.delete(taskId); return n; });
    }
  };

  const ids = new Set(view.map((e) => e.taskId));
  const rows: PoolRow[] = [
    ...view.filter((e) => !removing.has(e.taskId)),
    ...adds
      .filter((x) => !ids.has(x.taskId))
      .map((x) => ({ taskId: x.taskId, authorName: '', text: x.text, mine: true, pending: true })),
  ];
  return { rows, add, remove, deleteError };
}
