import { useState } from 'react';
import type { GameSnapshot } from '../../game/GameClient';
import { errorMessage } from '../../game/errorMessages';
import { RisoButton } from '../../components/riso/RisoButton';
import { MIN_POOL_SIZE } from './constants';
import styles from './LaunchBar.module.css';

/** Host-only: who still needs tasks, the pool counter, and Launch once everyone is ready. */
export function LaunchBar({ snapshot, onLaunch }: { snapshot: GameSnapshot; onLaunch: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const names = new Map(snapshot.seats.map((s) => [s.seatId, s.name]));
  const lines = Object.entries(snapshot.game.shortfalls)
    .filter(([, n]) => n > 0)
    .map(([seatId, n]) => `${names.get(seatId) ?? 'Someone'} needs ${n} more task${n === 1 ? '' : 's'}`)
    .sort();
  const pool = snapshot.view.length;
  const ready = lines.length === 0 && pool >= MIN_POOL_SIZE;

  const launch = async () => {
    setBusy(true);
    setError(null);
    try {
      await onLaunch();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.bar}>
      <div className={styles.counter} aria-label="Pool size">{pool} / {MIN_POOL_SIZE}</div>
      {lines.length > 0 && (
        <ul className={styles.lines}>
          {lines.map((l) => <li key={l}>{l}</li>)}
        </ul>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <RisoButton kind="green" size="large" fullWidth disabled={!ready || busy} onClick={launch}>Launch</RisoButton>
    </div>
  );
}
