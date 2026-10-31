import type { Standing } from 'game-core';
import { RisoMiniBoardArt } from '../../components/riso/RisoMiniBoardArt';
import styles from './Leaderboard.module.css';

/** "{n} bingo" / "{n} bingos". */
export const bingoPill = (n: number): string => `${n} bingo${n === 1 ? '' : 's'}`;

/** "{marked} squares", plus " · {bestLine} in a row" while the player has no bingo. */
export const standingMeta = (s: Standing): string =>
  s.bingos === 0 ? `${s.marked} squares · ${s.bestLine} in a row` : `${s.marked} squares`;

/**
 * The standings, one row per player in server order: rank, name, a gold bingo pill (hidden at 0) and a
 * muted squares line. `tasksPerBoard` is accepted for callers that size by it; the rows do not show it.
 */
export function Leaderboard({ standings }: { standings: Standing[]; tasksPerBoard: number }) {
  if (standings.length === 0) {
    return (
      <div className={styles.empty}>
        <RisoMiniBoardArt />
        <p className={styles.emptyText}>No bingos yet</p>
      </div>
    );
  }
  return (
    <ol className={styles.list}>
      {standings.map((s, i) => (
        <li key={s.seatId} className={styles.row} data-testid="standing">
          <span className={styles.rank}>{i + 1}</span>
          <span className={styles.who}>
            <span className={styles.name}>{s.name}</span>
            <span className={styles.meta}>{standingMeta(s)}</span>
          </span>
          {s.bingos > 0 && <span className={styles.num}>{bingoPill(s.bingos)}</span>}
        </li>
      ))}
    </ol>
  );
}
