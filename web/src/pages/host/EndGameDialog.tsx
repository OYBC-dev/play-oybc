import { useState, type RefObject } from 'react';
import { RisoButton } from '../../components/riso/RisoButton';
import { errorMessage } from '../../game/errorMessages';
import type { GameClient } from '../../game/GameClient';
import { Dialog } from '../play/Dialog';
import styles from './host.module.css';

/** Host confirm for ending the game; calls `client.end` and closes on success. */
export function EndGameDialog({ client, gameId, onClose, returnFocus }: {
  client: GameClient; gameId: string; onClose: () => void; returnFocus?: RefObject<HTMLElement | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const end = async () => {
    setBusy(true);
    setError(null);
    try {
      await client.end(gameId);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="End the game?" onClose={onClose} returnFocus={returnFocus}>
      <p className={styles.body}>Marking stops for everyone and the final leaderboard goes up.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className={styles.dialogActions}>
        <RisoButton kind="ghost" fullWidth onClick={onClose}>Cancel</RisoButton>
        <RisoButton kind="primary" fullWidth disabled={busy} onClick={() => void end()}>End game</RisoButton>
      </div>
    </Dialog>
  );
}
