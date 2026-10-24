import type { GameSnapshot } from '../../game/GameClient';
import { RisoBadge } from '../../components/riso/RisoBadge';
import styles from './PlayerList.module.css';

/** Every player as a pill in join order; the host's pill carries the Host badge. */
export function PlayerList({ snapshot, id }: { snapshot: GameSnapshot; id?: string }) {
  const seats = [...snapshot.seats].sort((a, b) => a.joinedAt - b.joinedAt);
  return (
    <div className={styles.wrap}>
      <ul id={id} className={styles.list} aria-label="Players">
        {seats.map((s) => (
          <li key={s.seatId} className={styles.player}>
            <span className={styles.name}>{s.name}</span>
            {s.seatId === snapshot.game.hostSeatId && <RisoBadge kind="expiring">Host</RisoBadge>}
          </li>
        ))}
      </ul>
    </div>
  );
}
