import { useRef, useState, type KeyboardEvent } from 'react';
import type { RosterName } from 'game-core';
import { RisoButton } from '../../components/riso/RisoButton';
import { errorMessage } from '../../game/errorMessages';
import type { GameClient } from '../../game/GameClient';
import { Dialog } from '../play/Dialog';
import styles from './BindNameSheet.module.css';

interface Choice { seatId: string | null; label: string }

/**
 * Host only: says which joined player a roster name is. Each row binds at once (`client.bindName`, the list
 * disabled until the ack) and the sheet stays open; `Done` closes it. `Not coming` asks first, then
 * retires the name (`client.retireName`) and closes.
 */
export function BindNameSheet({ client, gameId, name, seats, onClose }: {
  client: GameClient;
  gameId: string;
  /** The roster row, live from the snapshot. */
  name: RosterName;
  /** Joined players in join order. */
  seats: ReadonlyArray<{ seatId: string; name: string }>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ seatId: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const radios = useRef<(HTMLButtonElement | null)[]>([]);

  const choices: Choice[] = [...seats.map((s) => ({ seatId: s.seatId, label: s.name })), { seatId: null, label: 'Nobody yet' }];
  const boundId = seats.some((s) => s.seatId === name.seatId) ? name.seatId : null;
  const selected = pending ? pending.seatId : boundId;
  const tabStop = Math.max(0, choices.findIndex((c) => c.seatId === selected));

  const bind = async (seatId: string | null) => {
    if (busy || seatId === selected) return;
    setBusy(true);
    setError(null);
    setPending({ seatId });
    try {
      await client.bindName(gameId, name.key, seatId);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(null);
      setBusy(false);
    }
  };

  const retire = async () => {
    setBusy(true);
    setError(null);
    try {
      await client.retireName(gameId, name.key);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  /** Arrow keys move focus through the group (no write until Enter / Space / tap). */
  const onRadioKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    radios.current[(i + step + choices.length) % choices.length]?.focus();
  };

  if (confirming) {
    return (
      <Dialog title="Not coming?" onClose={() => setConfirming(false)}>
        <p className={styles.who}>{name.display}</p>
        {error && <p className="error" role="alert">{error}</p>}
        <div className={styles.actions}>
          <RisoButton kind="ghost" fullWidth onClick={() => setConfirming(false)}>Cancel</RisoButton>
          <RisoButton kind="primary" fullWidth disabled={busy} onClick={() => void retire()}>Remove</RisoButton>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={name.display} onClose={onClose}>
      <div role="radiogroup" aria-label={name.display} aria-busy={busy} className={styles.radios}>
        {choices.map((c, i) => {
          const checked = c.seatId === selected;
          return (
            <button
              key={c.seatId ?? 'nobody'}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={busy}
              tabIndex={i === tabStop ? 0 : -1}
              ref={(el) => { radios.current[i] = el; }}
              className={styles.radio}
              onClick={() => void bind(c.seatId)}
              onKeyDown={(e) => onRadioKey(e, i)}
            >
              <span className={styles.ring} data-checked={String(checked)} aria-hidden="true"><span /></span>
              <span className={c.seatId === null ? `${styles.radioName} ${styles.nobody}` : styles.radioName}>{c.label}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className={styles.actions}>
        <RisoButton kind="ghost" fullWidth onClick={onClose}>Done</RisoButton>
      </div>
      <button type="button" className={styles.retire} disabled={busy} onClick={() => { setError(null); setConfirming(true); }}>
        Not coming
      </button>
    </Dialog>
  );
}
