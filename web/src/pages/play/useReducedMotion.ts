import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/** True while the user prefers reduced motion; tracks changes. */
export function useReducedMotion(): boolean {
  const mq = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null);
  const [reduced, setReduced] = useState(() => mq()?.matches ?? false);
  useEffect(() => {
    const m = mq();
    if (!m) return;
    const on = () => setReduced(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduced;
}
