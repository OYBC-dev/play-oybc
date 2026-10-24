import { useEffect, useRef, useState } from 'react';
import type { BingoDoc } from 'game-core';
import { Confetti } from './Confetti';
import { useReducedMotion } from './useReducedMotion';
import styles from './BingoBanner.module.css';

const EXIT_MS = 380;

/** The ink star tile at the banner's left. */
function Star() {
  return (
    <span className={styles.tile} aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" /></svg>
    </span>
  );
}

/**
 * Stacked "<Name> got a bingo!" banners. `queue` is front-first; the front is tappable
 * and rotated, the rest sit behind it (+12px, -4.5% scale each). A dismissed banner
 * lifts away for 380 ms while the next springs forward. Confetti bursts once per banner
 * as it becomes the front.
 */
export function BingoBanner({ queue, onDismiss }: { queue: BingoDoc[]; onDismiss: () => void }) {
  const reduced = useReducedMotion();
  const prev = useRef<BingoDoc[]>([]);
  const [leaving, setLeaving] = useState<BingoDoc[]>([]);

  useEffect(() => {
    const gone = reduced ? [] : prev.current.filter((b) => !queue.some((q) => q.seq === b.seq));
    prev.current = queue;
    if (gone.length === 0) return;
    setLeaving((l) => [...l, ...gone]);
    const t = setTimeout(() => setLeaving((l) => l.filter((b) => !gone.includes(b))), EXIT_MS);
    return () => clearTimeout(t);
  }, [queue, reduced]);

  const front = queue[0] ?? null;
  return (
    <>
      <div className={styles.sr} role="status" aria-live="polite" data-testid="bingo-announce">
        {front ? `${front.name} got a bingo!` : ''}
      </div>
      {front && !reduced && <Confetti key={front.seq} seed={front.seq} />}
      <div className={styles.stack}>
        {leaving.map((b) => (
          <div key={`out-${b.seq}`} className={styles.slot} style={{ zIndex: 30 }} data-testid="bingo-banner-leaving" aria-hidden="true">
            <div className={`${styles.card} ${styles.leave}`}><Star /><span className={styles.text}>{b.name} got a bingo!</span></div>
          </div>
        ))}
        {queue.map((b, i) => (
          <div key={b.seq} className={styles.slot} style={{ zIndex: 20 - i }}>
            <div
              className={styles.pose}
              data-testid="bingo-banner"
              data-position={i}
              style={{ transform: `translateY(${i * 12}px) scale(${1 - i * 0.045}) rotate(${i === 0 ? -1.2 : 0}deg)` }}
            >
              {i === 0 ? (
                <button type="button" className={styles.card} onClick={onDismiss} onKeyDown={(e) => { if (e.key === 'Escape') onDismiss(); }}>
                  <Star /><span className={styles.text}>{b.name} got a bingo!</span>
                </button>
              ) : (
                <div className={styles.card} aria-hidden="true"><Star /><span className={styles.text}>{b.name} got a bingo!</span></div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
