import { useEffect, useState } from 'react';

/** Phone widths (390–430px) where the Pool title and a 5-avatar stack collide. */
export const NARROW_QUERY = '(max-width: 430px)';

/** True while the viewport matches NARROW_QUERY; false where matchMedia is missing (tests, SSR). */
export function useNarrow(): boolean {
  const mq = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(NARROW_QUERY) : null);
  const [narrow, setNarrow] = useState(() => mq()?.matches ?? false);
  useEffect(() => {
    const m = mq();
    if (!m) return;
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}
