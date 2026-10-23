import { useEffect, useRef, useState } from 'react';
import type { BoardDoc, ToggleMarkRes } from 'game-core';
import { errorMessage } from '../../game/errorMessages';
import { cellsInLines } from './cellsInLines';
import { Sheet } from './Sheet';
import styles from './BoardGrid.module.css';

const PENDING_DIM_MS = 250;
const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 10;

export interface BoardGridProps {
  board: BoardDoc;
  onToggle: (cellIndex: number) => Promise<ToggleMarkRes>;
  /** Final boards: nothing is tappable. */
  readOnly?: boolean;
}

/**
 * The 5x5 board. Taps flip optimistically; the server's marks (next snapshot) win,
 * a rejected call rolls back and shows its error. A cell in flight is disabled and
 * only looks dimmed once the call has taken longer than 250 ms.
 */
export function BoardGrid({ board, onToggle, readOnly = false }: BoardGridProps) {
  const [overrides, setOverrides] = useState<ReadonlyMap<number, boolean>>(new Map());
  const [inFlight, setInFlight] = useState<ReadonlySet<number>>(new Set());
  const [slow, setSlow] = useState<ReadonlySet<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const longPressed = useRef(false);
  const inFlightRef = useRef(inFlight);
  inFlightRef.current = inFlight;
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  // A fresh snapshot is authoritative: drop optimistic flips for cells with no call outstanding.
  useEffect(() => {
    setOverrides((o) => {
      if (o.size === 0) return o;
      const next = new Map([...o].filter(([i]) => inFlightRef.current.has(i)));
      return next.size === o.size ? o : next;
    });
  }, [board]);
  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    if (press.current) clearTimeout(press.current.timer);
  }, []);

  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const startPress = (e: React.PointerEvent, text: string) => {
    cancelPress();
    longPressed.current = false;
    const timer = setTimeout(() => {
      longPressed.current = true;
      press.current = null;
      setDetail(text);
    }, LONG_PRESS_MS);
    press.current = { timer, x: e.clientX, y: e.clientY };
  };
  const movePress = (e: React.PointerEvent) => {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_CANCEL_PX) cancelPress();
  };

  const cleared = (set: ReadonlySet<number>, i: number) => { const n = new Set(set); n.delete(i); return n; };

  const tap = async (i: number) => {
    const want = !(overrides.get(i) ?? board.marks[i]);
    setError(null);
    setOverrides((o) => new Map(o).set(i, want));
    setInFlight((s) => new Set(s).add(i));
    timers.current.set(i, setTimeout(() => setSlow((s) => new Set(s).add(i)), PENDING_DIM_MS));
    try {
      await onToggle(i);
    } catch (e) {
      setOverrides((o) => { const n = new Map(o); n.delete(i); return n; });
      setError(errorMessage(e));
    } finally {
      clearTimeout(timers.current.get(i));
      timers.current.delete(i);
      setSlow((s) => cleared(s, i));
      setInFlight((s) => cleared(s, i));
    }
  };

  const highlighted = cellsInLines(board.completedLines);
  return (
    <div className={styles.wrap}>
      <div className={styles.grid}>
        {board.cells.map((cell, i) => {
          const free = cell.kind === 'free';
          const marked = free || (overrides.get(i) ?? board.marks[i]);
          const label = cell.kind === 'free' ? 'Free' : cell.text;
          return (
            <button
              key={i}
              type="button"
              className={styles.cell}
              aria-label={label}
              aria-pressed={free ? undefined : marked}
              data-marked={String(marked)}
              data-highlight={String(highlighted.has(i))}
              data-pending={String(slow.has(i))}
              data-free={String(free)}
              aria-disabled={readOnly && !free ? true : undefined}
              disabled={free || (!readOnly && inFlight.has(i))}
              onPointerDown={free ? undefined : (e) => startPress(e, label)}
              onPointerMove={movePress}
              onPointerUp={cancelPress}
              onPointerCancel={() => { cancelPress(); longPressed.current = false; }}
              onPointerLeave={cancelPress}
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => {
                if (longPressed.current) { longPressed.current = false; return; }
                if (!readOnly) void tap(i);
              }}
            >
              <span className={styles.text}>{label}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {detail !== null && (
        <Sheet title="Task" onClose={() => setDetail(null)}>
          <p className={styles.detail}>{detail}</p>
        </Sheet>
      )}
    </div>
  );
}
