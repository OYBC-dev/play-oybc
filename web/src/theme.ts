/** Harvest colorway + system light/dark. Both attributes live on <html>. */
export const COLORWAY = 'harvest';

type Listener = (e: { matches: boolean }) => void;
type MQ = {
  matches: boolean;
  addEventListener?: (type: 'change', cb: Listener) => void;
  removeEventListener?: (type: 'change', cb: Listener) => void;
  addListener?: (cb: Listener) => void;
  removeListener?: (cb: Listener) => void;
};

/**
 * Applies data-pt and data-theme to the document and keeps data-theme in sync
 * with prefers-color-scheme. A missing media query falls back to light.
 * Returns an unsubscribe function.
 */
export function applyTheme(doc: Document, mq: MQ | null | undefined): () => void {
  const root = doc.documentElement;
  root.setAttribute('data-pt', COLORWAY);
  const set = (dark: boolean) => root.setAttribute('data-theme', dark ? 'dark' : 'light');
  set(!!mq?.matches);
  if (!mq) return () => {};
  const onChange: Listener = (e) => set(e.matches);
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }
  if (typeof mq.addListener === 'function') {
    mq.addListener(onChange);
    return () => mq.removeListener?.(onChange);
  }
  return () => {};
}
