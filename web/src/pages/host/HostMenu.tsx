import { useState } from 'react';
import { RisoButton } from '../../components/riso/RisoButton';
import { errorMessage } from '../../game/errorMessages';
import type { GameClient, GameSnapshot } from '../../game/GameClient';
import { Sheet } from '../play/Sheet';
import styles from './host.module.css';

/** Host-only menu: hand the host role to another player (after a confirm). Renders nothing for non-hosts. */
export function HostMenu({ client, gameId, snapshot }: { client: GameClient; gameId: string; snapshot: GameSnapshot }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<{ seatId: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (snapshot.game.hostSeatId !== snapshot.mySeatId) return null;

  const others = [...snapshot.seats].filter((s) => s.seatId !== snapshot.mySeatId).sort((a, b) => a.joinedAt - b.joinedAt);
  const close = () => { setOpen(false); setTarget(null); setError(null); };

  const transfer = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await client.transferHost(gameId, target.seatId);
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <RisoButton size="small" onClick={() => setOpen(true)}>Host menu</RisoButton>
      {open && !target && (
        <Sheet title="Host menu" onClose={close}>
          {others.length === 0 ? <p className="muted">No other players</p> : (
            <ul className={styles.list}>
              {others.map((s) => (
                <li key={s.seatId} className={styles.row}>
                  <span className={styles.who}>{s.name}</span>
                  <RisoButton size="small" aria-label={`Make ${s.name} host`} onClick={() => { setError(null); setTarget({ seatId: s.seatId, name: s.name }); }}>Make host</RisoButton>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      )}
      {open && target && (
        <Sheet title={`Make ${target.name} host`} onClose={close}>
          <p className={styles.body}>{target.name} takes over hosting. You become a regular player.</p>
          {error && <p className="error" role="alert">{error}</p>}
          <div className={styles.actions}>
            <RisoButton onClick={() => setTarget(null)}>Cancel</RisoButton>
            <RisoButton kind="primary" disabled={busy} onClick={() => void transfer()}>Make host</RisoButton>
          </div>
        </Sheet>
      )}
    </>
  );
}
