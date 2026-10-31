import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { RosterName } from 'game-core';
import { RisoButton } from '../../components/riso/RisoButton';
import { errorMessage } from '../../game/errorMessages';
import type { GameClient } from '../../game/GameClient';
import { Dialog } from '../play/Dialog';
import { Sheet } from '../play/Sheet';
import styles from './BindNameSheet.module.css';

interface Choice { seatId: string | null; label: string }

/** Title of the Not coming confirm: "<Name> isn’t coming?". */
export const notComingTitle = (name: string): string => `${name} isn’t coming?`;

/**
 * Host only, lobby only: a bottom sheet saying which joined player a roster name is. `Nobody yet` (first)
 * unbinds; every player row binds at once (`client.bindName`; the rows are disabled while a write is in
 * flight). The picked row stays selected from the tap until the snapshot shows that binding, so the ring
 * never flickers back on the ack. `Done` closes. An unbound name also gets `Not coming`, which asks first,
 * then retires the name (`client.retireName`) and closes.
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
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [retiring, setRetiring] = useState(false);
  const radios = useRef<(HTMLButtonElement | null)[]>([]);

  const choices: Choice[] = [{ seatId: null, label: 'Nobody yet' }, ...seats.map((s) => ({ seatId: s.seatId, label: s.name }))];
  const boundId = seats.some((s) => s.seatId === name.seatId) ? name.seatId : null;
  const selected = pending ? pending.seatId : boundId;
  const tabStop = Math.max(0, choices.findIndex((c) => c.seatId === selected));

  // The snapshot caught up with the pick: the live binding takes over.
  useEffect(() => {
    if (pending && pending.seatId === boundId) setPending(null);
  }, [pending, boundId]);

  const bind = async (seatId: string | null) => {
    if (busy || seatId === selected) return;
    setBusy(true);
    setError(null);
    setPending({ seatId });
    try {
      await client.bindName(gameId, name.key, seatId);
    } catch (e) {
      setError(errorMessage(e));
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  const retire = async () => {
    setRetiring(true);
    setConfirmError(null);
    try {
      await client.retireName(gameId, name.key);
      setConfirming(false);
      onClose();
    } catch (e) {
      setConfirmError(errorMessage(e));
      setRetiring(false);
    }
  };

  /** Arrow keys move focus through the group (no write until Enter / Space / tap). */
  const onRadioKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    radios.current[(i + step + choices.length) % choices.length]?.focus();
  };

  return (
    <>
      <Sheet title={name.display} onClose={onClose} className={styles.sheet}>
        <div role="radiogroup" aria-label="Players" aria-busy={busy} className={styles.radios}>
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
        {selected === null && (
          <button type="button" className={styles.retire} disabled={busy} onClick={() => { setConfirmError(null); setConfirming(true); }}>
            Not coming
          </button>
        )}
      </Sheet>
      {confirming && (
        <Dialog title={notComingTitle(name.display)} onClose={() => setConfirming(false)}>
          {confirmError && <p className="error" role="alert">{confirmError}</p>}
          <div className={styles.actions}>
            <RisoButton kind="ghost" fullWidth onClick={() => setConfirming(false)}>Cancel</RisoButton>
            <RisoButton kind="primary" fullWidth disabled={retiring} onClick={() => void retire()}>Not coming</RisoButton>
          </div>
        </Dialog>
      )}
    </>
  );
}
