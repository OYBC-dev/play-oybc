import type { GameSnapshot } from '../../game/GameClient';
import styles from './PlayerList.module.css';

/** Everyone in the lobby, host marked, you marked. */
export function PlayerList({ snapshot }: { snapshot: GameSnapshot }) {
  const seats = [...snapshot.seats].sort((a, b) => a.joinedAt - b.joinedAt);
  return (
    <ul className={styles.list} aria-label="Players">
      {seats.map((s) => (
        <li key={s.seatId} className={styles.player}>
          <span className={styles.name}>{s.name}</span>
          {s.seatId === snapshot.game.hostSeatId && <span className={styles.badge}>Host</span>}
          {s.seatId === snapshot.mySeatId && <span className={styles.badge}>You</span>}
        </li>
      ))}
    </ul>
  );
}
