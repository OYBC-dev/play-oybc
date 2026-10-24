import { useState } from 'react';
import { RisoButton } from '../../components/riso/RisoButton';
import { RisoCard } from '../../components/riso/RisoCard';
import { errorMessage } from '../../game/errorMessages';
import type { GameClient, GameSnapshot } from '../../game/GameClient';
import styles from './host.module.css';

/** Host-only: a toast card per pending reclaim with Allow / Deny. Renders nothing when none are pending. */
export function ReclaimPrompt({ client, gameId, reclaims }: { client: GameClient; gameId: string; reclaims: GameSnapshot['reclaims'] }) {
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
      {reclaims.map((r) => (
        <RisoCard key={r.id} shadow="large" padded className={styles.reclaim}>
          <span className={styles.who}>Someone wants to take {r.name}&apos;s seat</span>
          <div className={styles.actions}>
            <RisoButton kind="green" disabled={busy === r.id} onClick={() => void resolve(r.id, true)}>Allow</RisoButton>
            <RisoButton kind="neutral" disabled={busy === r.id} onClick={() => void resolve(r.id, false)}>Deny</RisoButton>
          </div>
        </RisoCard>
      ))}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
