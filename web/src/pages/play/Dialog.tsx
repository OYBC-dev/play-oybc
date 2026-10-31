import { useId, useRef, type ReactNode, type RefObject } from 'react';
import { RisoCard } from '../../components/riso/RisoCard';
import { RisoSectionLabel } from '../../components/riso/RisoSectionLabel';
import { useModalFocus } from './useModalFocus';
import styles from './Dialog.module.css';

/** A scrim click this soon after opening is the tail of the gesture that opened it. */
const SCRIM_GUARD_MS = 400;

export interface DialogProps {
  /** Heading; also the dialog's accessible name. */
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Where focus goes on close (defaults to whatever was focused on open). */
  returnFocus?: RefObject<HTMLElement | null>;
  /** Optional red kicker above the title. */
  kicker?: string;
  /** Extra class on the card (e.g. a larger title or tighter padding). */
  className?: string;
}

/**
 * Centered modal dialog over a scrim: role=dialog + aria-modal, labelled by
 * its title, focus moves in and is trapped, Escape or a scrim tap closes.
 */
export function Dialog({ title, onClose, children, returnFocus, kicker, className }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const openedAt = useRef(performance.now());
  const onKeyDown = useModalFocus(ref, onClose, returnFocus);

  return (
    <div
      className={styles.scrim}
      onClick={(e) => { if (e.target === e.currentTarget && performance.now() - openedAt.current > SCRIM_GUARD_MS) onClose(); }}
    >
      <div ref={ref} className={styles.box} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
        <RisoCard padded shadow="large" className={className ? `${styles.card} ${className}` : styles.card}>
          {kicker ? (
            <div className={styles.head}>
              <RisoSectionLabel variant="kicker">{kicker}</RisoSectionLabel>
              <h2 id={titleId} className={styles.title}>{title}</h2>
            </div>
          ) : (
            <h2 id={titleId} className={styles.title}>{title}</h2>
          )}
          {children}
        </RisoCard>
      </div>
    </div>
  );
}
