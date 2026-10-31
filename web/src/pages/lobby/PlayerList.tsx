import type { GameSnapshot } from '../../game/GameClient';
import { RisoBadge } from '../../components/riso/RisoBadge';
import styles from './PlayerList.module.css';

/**
 * Every player as a pill in join order (the host's carries the Host badge), each roster name bound to a
 * player as a tag inside that player's pill, then one dashed pill per roster name nobody has yet. For the
 * host the tags and dashed pills are buttons (`onOpenName` with the name's key); for guests they are static.
 */
export function PlayerList({ snapshot, id, isHost = false, onOpenName }: {
  snapshot: GameSnapshot; id?: string; isHost?: boolean; onOpenName?: (key: string) => void;
}) {
  const seats = [...snapshot.seats].sort((a, b) => a.joinedAt - b.joinedAt);
  const seatIds = new Set(seats.map((s) => s.seatId));
  const roster = snapshot.roster ?? [];
  const unbound = roster.filter((r) => r.seatId === null || !seatIds.has(r.seatId));
  const canEdit = isHost && onOpenName !== undefined;

  return (
    <div className={styles.wrap}>
      <ul id={id} className={styles.list} aria-label="Players">
        {seats.map((s) => (
          <li key={s.seatId} className={styles.player}>
            <span className={styles.name}>{s.name}</span>
            {s.seatId === snapshot.game.hostSeatId && <RisoBadge kind="expiring">Host</RisoBadge>}
            {roster.filter((r) => r.seatId === s.seatId).map((r) => (canEdit ? (
              <button key={r.key} type="button" className={`${styles.tag} ${styles.tagButton}`} onClick={() => onOpenName(r.key)}>
                <span className={styles.tagText}>{r.display}</span>
              </button>
            ) : (
              <span key={r.key} className={styles.tag}><span className={styles.tagText}>{r.display}</span></span>
            )))}
          </li>
        ))}
        {unbound.map((r) => (
          <li key={r.key} className={styles.slot} data-testid="roster-name">
            {canEdit ? (
              <button type="button" className={`${styles.player} ${styles.dashed} ${styles.pillButton}`} onClick={() => onOpenName(r.key)}>
                <span className={styles.name}>{r.display}</span>
              </button>
            ) : (
              <span className={`${styles.player} ${styles.dashed}`}><span className={styles.name}>{r.display}</span></span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
