import { useEffect, useMemo, useState } from 'react';
import styles from './Confetti.module.css';

const COLORS = ['--riso-red', '--riso-blue', '--riso-gold', '--riso-green', '--riso-teal'] as const;
const PIECES = 54;

interface Piece { left: number; w: number; h: number; round: boolean; color: string; dur: number; delay: number }

/** Small deterministic LCG so a given banner always bursts the same way. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/** The 54 pieces of one burst: 6-12 x 9-17 px, 1.9-3.2 s fall, 0-520 ms jitter. */
export function makePieces(seed: number): Piece[] {
  const rng = seeded(seed * 2654435761 + 20261031);
  return Array.from({ length: PIECES }, () => ({
    left: Math.round(rng() * 100),
    w: 6 + Math.round(rng() * 6),
    h: 9 + Math.round(rng() * 8),
    round: rng() < 0.3,
    color: COLORS[Math.floor(rng() * COLORS.length)],
    dur: 1.9 + rng() * 1.3,
    delay: Math.round(rng() * 520),
  }));
}

/** One confetti burst; removes itself from the DOM once the last piece has landed. */
export function Confetti({ seed }: { seed: number }) {
  const pieces = useMemo(() => makePieces(seed), [seed]);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const total = Math.max(...pieces.map((p) => p.dur * 1000 + p.delay));
    const t = setTimeout(() => setDone(true), total + 50);
    return () => clearTimeout(t);
  }, [pieces]);
  if (done) return null;
  return (
    <div className={styles.layer} data-testid="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className={`${styles.piece} risoConfetti`}
          style={{
            left: `${p.left}%`, width: p.w, height: p.h, borderRadius: p.round ? 99 : 1,
            background: `var(${p.color})`, animationDuration: `${p.dur.toFixed(2)}s`, animationDelay: `${p.delay}ms`,
          }}
        />
      ))}
    </div>
  );
}
