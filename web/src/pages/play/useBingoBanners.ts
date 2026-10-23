import { useCallback, useEffect, useRef, useState } from 'react';
import type { BingoDoc } from 'game-core';

const SHOW_MS = 4000;

/**
 * Queue of "<Name> got a bingo!" banners. Bingos present at first render and the
 * player's own never show; each banner auto-dismisses after 4 s.
 */
export function useBingoBanners(bingos: BingoDoc[], mySeatId: string): { current: BingoDoc | null; dismiss(): void } {
  const seen = useRef<Set<number> | null>(null);
  if (seen.current === null) seen.current = new Set(bingos.map((b) => b.seq));
  const [queue, setQueue] = useState<BingoDoc[]>([]);

  useEffect(() => {
    const fresh = bingos.filter((b) => !seen.current!.has(b.seq));
    if (fresh.length === 0) return;
    fresh.forEach((b) => seen.current!.add(b.seq));
    const others = fresh.filter((b) => b.seatId !== mySeatId).sort((a, b) => a.seq - b.seq);
    if (others.length) setQueue((q) => [...q, ...others]);
  }, [bingos, mySeatId]);

  const current = queue[0] ?? null;
  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(dismiss, SHOW_MS);
    return () => clearTimeout(t);
  }, [current, dismiss]);

  return { current, dismiss };
}
