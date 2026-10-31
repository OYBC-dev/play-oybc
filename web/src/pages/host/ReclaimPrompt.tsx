import { useState } from 'react';
import { RisoButton } from '../../components/riso/RisoButton';
import { RisoCard } from '../../components/riso/RisoCard';
import { errorMessage } from '../../game/errorMessages';
import type { GameClient, GameSnapshot } from '../../game/GameClient';
import styles from './host.module.css';

/**
 * Host-only: a toast card per pending reclaim with Allow / Deny. Renders nothing when none are pending.
 * Names the SEAT being taken (from `seats`); when the newcomer typed a different name (a bound nickname),
 * it says so, since Allow evicts whoever holds that seat.
 */
export function ReclaimPrompt({ client, gameId, reclaims, seats = [] }: {
  client: GameClient; gameId: string; reclaims: GameSnapshot['reclaims']; seats?: GameSnapshot['seats'];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (reclaims.length === 0) return null;

  const resolve = async (id: string, approve: boolean) => {
    setBusy(id);
    setError(null);
    try {
      await client.resolveReclaim(gameId, id, approve);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.reclaims} data-testid="reclaim-prompt">
      {reclaims.map((r) => {
        const seatName = seats.find((s) => s.seatId === r.seatId)?.name ?? r.name;
        const who = seatName.toLowerCase() === r.name.toLowerCase()
          ? `Someone wants to take ${seatName}'s seat`
          : `Someone as ${r.name} wants to take ${seatName}'s seat`;
        return (
        <RisoCard key={r.id} shadow="large" padded className={styles.reclaim}>
          <span className={styles.who}>{who}</span>
          <div className={styles.actions}>
            <RisoButton kind="green" disabled={busy === r.id} onClick={() => void resolve(r.id, true)}>Allow</RisoButton>
            <RisoButton kind="neutral" disabled={busy === r.id} onClick={() => void resolve(r.id, false)}>Deny</RisoButton>
          </div>
        </RisoCard>
        );
      })}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
