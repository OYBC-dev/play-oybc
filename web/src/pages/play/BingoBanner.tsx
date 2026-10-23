import type { BingoDoc } from 'game-core';
import styles from './BingoBanner.module.css';

/** The celebratory "<Name> got a bingo!" banner; tap to dismiss. */
export function BingoBanner({ bingo, onDismiss }: { bingo: BingoDoc | null; onDismiss: () => void }) {
  return (
    <div role="status" aria-live="polite">
      {bingo && (
        <button type="button" key={bingo.seq} className={styles.banner} onClick={onDismiss} onKeyDown={(e) => { if (e.key === "Escape") onDismiss(); }}>
          {bingo.name} got a bingo!
        </button>
      )}
    </div>
  );
}
