import { useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { RisoButton } from '../../components/riso/RisoButton';
import { errorMessage } from '../../game/errorMessages';
import type { GameClient } from '../../game/GameClient';
import { Dialog } from '../play/Dialog';
import styles from './host.module.css';

export interface HostCandidate { seatId: string; name: string }

/** Host picks another player from a radio list, then hands over the host role. */
export function MakeHostDialog({ client, gameId, candidates, onClose, returnFocus }: {
  client: GameClient; gameId: string; candidates: readonly HostCandidate[]; onClose: () => void;
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  const [picked, setPicked] = useState<HostCandidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  const tabStop = Math.max(0, candidates.findIndex((c) => c.seatId === picked?.seatId));

  const pick = (c: HostCandidate) => { setError(null); setPicked(c); };
  /** Arrow keys move through the group and select, like native radios. */
  const onRadioKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!step || candidates.length === 0) return;
    e.preventDefault();
    const next = (i + step + candidates.length) % candidates.length;
    pick(candidates[next]);
    radios.current[next]?.focus();
  };

  const transfer = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await client.transferHost(gameId, picked.seatId);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Make host" onClose={onClose} returnFocus={returnFocus}>
      <div role="radiogroup" aria-label="Players" className={styles.radios}>
        {candidates.map((c, i) => {
          const checked = picked?.seatId === c.seatId;
          return (
            <button
              key={c.seatId}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={i === tabStop ? 0 : -1}
              ref={(el) => { radios.current[i] = el; }}
              className={styles.radio}
              onClick={() => pick(c)}
              onKeyDown={(e) => onRadioKey(e, i)}
            >
              <span className={styles.ring} data-checked={String(checked)} aria-hidden="true"><span /></span>
              <span className={styles.radioName}>{c.name}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className={styles.dialogActions}>
        <RisoButton kind="ghost" fullWidth onClick={onClose}>Cancel</RisoButton>
        <RisoButton kind="blue" fullWidth disabled={!picked || busy} onClick={() => void transfer()}>
          <span className={styles.wrapLabel}>{picked ? `Make ${picked.name} host` : 'Make host'}</span>
        </RisoButton>
      </div>
    </Dialog>
  );
}
