import styles from './PlayBrandMark.module.css';

export interface PlayBrandMarkProps {
  /** 'header' is 44x34, 'home' is 110x85. */
  size: 'header' | 'home';
}

const GRID = [1, 0, 1, 0, 2, 0, 1, 0, 1] as const;

/** Geometry in the reference's own CSS pixels (box, card size, offsets). */
const GEO = {
  header: { w: 44, h: 34, vw: 60, vh: 46, card: 33, x: 13, y: 6, r: 5, pad: 4, gap: 1 },
  home: { w: 110, h: 85, vw: 143, vh: 110, card: 79, x: 32, y: 13, r: 12, pad: 10, gap: 2 },
} as const;

type Geo = (typeof GEO)[PlayBrandMarkProps['size']];

/** One fanned card: CSS-style inset 2px border, hard shadow, pivot at 50% 120%. */
function Card({ g, fill, angle }: { g: Geo; fill: string; angle: number }): React.ReactElement {
  const pivotX = g.x + g.card / 2;
  const pivotY = g.y + g.card * 1.2;
  return (
    <g transform={`rotate(${angle} ${pivotX} ${pivotY})`}>
      <rect x={g.x + 2} y={g.y + 2} width={g.card} height={g.card} rx={g.r} fill="var(--riso-shadow-ink)" />
      <rect x={g.x} y={g.y} width={g.card} height={g.card} rx={g.r} fill="var(--riso-ink)" />
      <rect x={g.x + 2} y={g.y + 2} width={g.card - 4} height={g.card - 4} rx={Math.max(g.r - 2, 1)} fill={fill} />
    </g>
  );
}

/**
 * Play OYBC brand mark: three fanned square cards from one pivot (back-left
 * blue -17deg, back-right gold +17deg, front red with a 3x3 grid of cream
 * diagonal cells and a gold centre). Inline SVG, colours from tokens; the
 * geometry is the reference's CSS box scaled to 44x34 / 110x85.
 */
export function PlayBrandMark({ size }: PlayBrandMarkProps): React.ReactElement {
  const g = GEO[size];
  const inner = g.card - 4 - g.pad * 2;
  const cell = (inner - g.gap * 2) / 3;
  const x0 = g.x + 2 + g.pad;
  const y0 = g.y + 2 + g.pad;
  return (
    <svg
      viewBox={`0 0 ${g.vw} ${g.vh}`}
      width={g.w}
      height={g.h}
      overflow="visible"
      role="img"
      aria-label="Play OYBC"
      data-size={size}
    >
      <Card g={g} fill="var(--riso-blue)" angle={-17} />
      <Card g={g} fill="var(--riso-gold)" angle={17} />
      <Card g={g} fill="var(--riso-red)" angle={0} />
      {GRID.map((v, i) => (
        <rect
          key={i}
          x={x0 + (i % 3) * (cell + g.gap)}
          y={y0 + Math.floor(i / 3) * (cell + g.gap)}
          width={cell}
          height={cell}
          rx={1}
          fill={v === 2 ? 'var(--riso-gold)' : 'var(--riso-on-color)'}
          fillOpacity={v === 0 ? 0.3 : 1}
        />
      ))}
    </svg>
  );
}

/** "OYBC" wordmark with the rotated "Play" stamp on its top-right corner. */
export function Wordmark(): React.ReactElement {
  return (
    <div className={styles.wordmark}>
      <span className={styles.word}>OYBC</span>
      <span className={styles.stamp}>Play</span>
    </div>
  );
}
