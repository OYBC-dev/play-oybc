import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]';

/**
 * Focus handling shared by modal surfaces (Sheet, Dialog): focus moves into
 * `ref` on mount, Tab / Shift+Tab are trapped inside it, Escape calls
 * `onClose`, and on unmount focus returns to `returnTo` (or whatever was
 * focused before the modal opened). When that element has left the DOM (e.g.
 * the host menu unmounts after a host transfer), focus goes to the page's
 * `[data-focus-fallback]` region instead of being dropped on <body>.
 *
 * @returns the keydown handler to put on the modal element.
 */
export function useModalFocus(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  returnTo?: RefObject<HTMLElement | null>,
): (e: KeyboardEvent) => void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const returnRef = useRef(returnTo);
  returnRef.current = returnTo;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => {
      const candidates = [returnRef.current?.current, previous];
      const target = candidates.find((el): el is HTMLElement => !!el && el.isConnected && el !== document.body)
        ?? document.querySelector<HTMLElement>('[data-focus-fallback]');
      target?.focus?.();
    };
  }, [ref]);

  return (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCloseRef.current();
    } else if (e.key === 'Tab' && ref.current) {
      const f = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (f.length === 0) { e.preventDefault(); return; }
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
}
