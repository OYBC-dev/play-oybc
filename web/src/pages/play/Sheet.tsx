import { useId, useRef, type ReactNode } from 'react';
import { RisoButton } from '../../components/riso/RisoButton';
import styles from './Sheet.module.css';
import { useModalFocus } from './useModalFocus';

/** A scrim click this soon after opening is the tail of the gesture that opened it (iOS long-press release). */
const SCRIM_GUARD_MS = 400;

/** Modal bottom sheet: focus moves in, Tab is trapped, Escape closes, focus returns on close. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const openedAt = useRef(performance.now());
  const onKeyDown = useModalFocus(ref, onClose);

  return (
    <div className={styles.scrim} onClick={(e) => { if (e.target === e.currentTarget && performance.now() - openedAt.current > SCRIM_GUARD_MS) onClose(); }}>
      <div ref={ref} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>{title}</h2>
          <RisoButton kind="ghost" size="small" onClick={onClose}>Done</RisoButton>
        </div>
        {children}
      </div>
    </div>
  );
}
