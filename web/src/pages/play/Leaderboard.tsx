import type { BingoDoc } from 'game-core';
import { RisoMiniBoardArt } from '../../components/riso/RisoMiniBoardArt';
import styles from './Leaderboard.module.css';

/** Local clock time as h:mm. */
function clock(at: number): string {
  const d = new Date(at);
  return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Announced bingos in the order they happened. */
export function Leaderboard({ bingos }: { bingos: BingoDoc[] }) {
  if (bingos.length === 0) {
    return (
      <div className={styles.empty}>
        <RisoMiniBoardArt />
        <p className={styles.emptyText}>No bingos yet</p>
      </div>
    );
  }
  const sorted = [...bingos].sort((a, b) => a.seq - b.seq);
  return (
    <ol className={styles.list}>
      {sorted.map((b, i) => (
        <li key={b.seq} className={styles.row}>
          <span className={styles.rank}>{i + 1}</span>
          <span className={styles.name}>{b.name}</span>
          <span className={styles.num} data-repeat={String(b.playerBingoNumber >= 2)}>#{b.playerBingoNumber}</span>
          <span className={styles.time}>{clock(b.at)}</span>
        </li>
      ))}
    </ol>
  );
}
