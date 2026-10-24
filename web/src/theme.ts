/** Harvest colorway + system light/dark. Both attributes live on <html>. */
export const COLORWAY = 'harvest';

type MQ = Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'>;

/**
 * Applies data-pt and data-theme to the document and keeps data-theme in sync
 * with prefers-color-scheme. Returns an unsubscribe function.
 */
export function applyTheme(doc: Document, mq: MQ): () => void {
  const root = doc.documentElement;
  root.setAttribute('data-pt', COLORWAY);
  const set = (dark: boolean) => root.setAttribute('data-theme', dark ? 'dark' : 'light');
  set(mq.matches);
  const onChange = (e: { matches: boolean }) => set(e.matches);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
