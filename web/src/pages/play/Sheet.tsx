import { useEffect, useId, useRef, type ReactNode } from 'react';
import { RisoButton } from '../../components/riso/RisoButton';
import styles from './Sheet.module.css';

/** Modal bottom sheet: focus moves in, Tab is trapped, Escape closes, focus returns on close. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => previous?.focus?.();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCloseRef.current();
    } else if (e.key === 'Tab' && ref.current) {
      const f = [...ref.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]')];
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  return (
    <div className={styles.scrim} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>{title}</h2>
          <RisoButton size="small" onClick={onClose}>Close</RisoButton>
        </div>
        {children}
      </div>
    </div>
  );
}
