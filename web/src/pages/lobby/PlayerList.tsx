import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { RosterName } from 'game-core';
import type { GameSnapshot } from '../../game/GameClient';
import { RisoBadge } from '../../components/riso/RisoBadge';
import { useReducedMotion } from '../play/useReducedMotion';
import chip from './RosterChip.module.css';
import styles from './PlayerList.module.css';

/** How long a retired name's chip takes to collapse before it unmounts. */
export const CHIP_OUT_MS = 180;

interface Leaving { row: RosterName; index: number; width: number }

/**
 * Keeps a dashed chip on screen for CHIP_OUT_MS after its name leaves the roster (retired), so it can
 * collapse instead of vanishing. A name that only got bound is still on the roster and does not animate.
 * Under reduced motion nothing lingers.
 */
function useLeavingChips(unbound: RosterName[], roster: RosterName[]) {
  const reduced = useReducedMotion();
  const widths = useRef(new Map<string, number>());
  const els = useRef(new Map<string, HTMLElement>());
  const previous = useRef<RosterName[]>(unbound);
  const [leaving, setLeaving] = useState<Leaving[]>([]);

  useLayoutEffect(() => {
    const keys = new Set(roster.map((r) => r.key));
    const gone = previous.current
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => !keys.has(row.key));
    previous.current = unbound;
    if (gone.length > 0 && !reduced) {
      setLeaving((l) => [
        ...l.filter((x) => !gone.some((g) => g.row.key === x.row.key)),
        ...gone.map((g) => ({ ...g, width: widths.current.get(g.row.key) ?? 0 })),
      ]);
    }
    // Remember the drawn widths for the next removal (read after commit, while the chips are mounted).
    for (const [key, el] of els.current) widths.current.set(key, el.offsetWidth);
  }, [unbound, roster, reduced]);

  useEffect(() => {
    if (leaving.length === 0) return;
    const t = setTimeout(() => setLeaving([]), CHIP_OUT_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  const ref = (key: string) => (el: HTMLElement | null) => {
    if (el) els.current.set(key, el); else els.current.delete(key);
  };
  // A name back on the roster (re-added) is drawn live, not as leaving.
  const live = new Set(roster.map((r) => r.key));
  return { leaving: leaving.filter((l) => !live.has(l.row.key)), ref };
}

/**
 * Every player as a pill in join order (the host's carries the Host badge), each roster name bound to a
 * player as a small solid tag inside that player's pill, then one dashed chip per roster name nobody has
 * yet. For the host the tags and dashed chips are buttons (`onOpenName` with the name's key); for guests
 * they are static and muted. A retired name's chip collapses out over CHIP_OUT_MS.
 */
export function PlayerList({ snapshot, id, isHost = false, onOpenName }: {
  snapshot: GameSnapshot; id?: string; isHost?: boolean; onOpenName?: (key: string) => void;
}) {
  const seats = [...snapshot.seats].sort((a, b) => a.joinedAt - b.joinedAt);
  const seatIds = new Set(seats.map((s) => s.seatId));
  const roster = snapshot.roster ?? [];
  const unbound = roster.filter((r) => r.seatId === null || !seatIds.has(r.seatId));
  const canEdit = isHost && onOpenName !== undefined;
  const { leaving, ref } = useLeavingChips(unbound, roster);

  const chips: Array<{ row: RosterName; leaving?: number }> = unbound.map((row) => ({ row }));
  for (const l of [...leaving].sort((a, b) => a.index - b.index)) {
    chips.splice(Math.min(l.index, chips.length), 0, { row: l.row, leaving: l.width });
  }

  return (
    <div className={styles.wrap}>
      <ul id={id} className={styles.list} aria-label="Players">
        {seats.map((s) => (
          <li key={s.seatId} className={styles.player}>
            <span className={styles.name}>{s.name}</span>
            {s.seatId === snapshot.mySeatId && <span className={styles.you}>You</span>}
            {s.seatId === snapshot.game.hostSeatId && <RisoBadge kind="expiring">Host</RisoBadge>}
            {roster.filter((r) => r.seatId === s.seatId).map((r) => (canEdit ? (
              <button
                key={r.key}
                type="button"
                className={`${styles.tag} ${styles.tagButton}`}
                aria-label={`${r.display}, bound to ${s.name}`}
                onClick={() => onOpenName(r.key)}
              >
                <span className={styles.tagText}>{r.display}</span>
              </button>
            ) : (
              <span key={r.key} className={`${styles.tag} ${styles.tagStatic}`}><span className={styles.tagText}>{r.display}</span></span>
            )))}
          </li>
        ))}
        {chips.map(({ row: r, leaving: width }) => (width !== undefined ? (
          <li
            key={`leaving:${r.key}`}
            className={`${styles.slot} ${styles.leaving}`}
            style={{ '--chip-w': `${width}px` } as CSSProperties}
            aria-hidden="true"
            data-testid="roster-name-leaving"
          >
            <span className={canEdit ? chip.chip : `${chip.chip} ${chip.static}`}><span className={chip.text}>{r.display}</span></span>
          </li>
        ) : (
          <li key={r.key} ref={ref(r.key)} className={styles.slot} data-testid="roster-name">
            {canEdit ? (
              <button
                type="button"
                className={`${chip.chip} ${styles.chipButton}`}
                aria-label={`${r.display}, nobody yet`}
                onClick={() => onOpenName(r.key)}
              >
                <span className={chip.text}>{r.display}</span>
              </button>
            ) : (
              <span className={`${chip.chip} ${chip.static}`}><span className={chip.text}>{r.display}</span></span>
            )}
          </li>
        )))}
      </ul>
    </div>
  );
}
