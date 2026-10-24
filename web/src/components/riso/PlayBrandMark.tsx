import styles from './PlayBrandMark.module.css';

export interface PlayBrandMarkProps {
  /** 'header' is 44x34, 'home' is 110x85. */
  size: 'header' | 'home';
}

const DIMS = { header: { w: 44, h: 34 }, home: { w: 110, h: 85 } } as const;

/** One fanned card: keyline, hard shadow, rotated about the shared pivot. */
function Card({ fill, angle }: { fill: string; angle: number }): React.ReactElement {
  return (
    <g transform={`rotate(${angle} 55 86.4)`}>
      <rect x="29" y="24" width="52" height="52" rx="5" fill="var(--riso-shadow-ink)" transform="translate(2 2)" />
      <rect x="29" y="24" width="52" height="52" rx="5" fill={fill} stroke="var(--riso-ink)" strokeWidth="2" />
    </g>
  );
}

/**
 * Play OYBC brand mark: three fanned square cards from one pivot (back-left
 * blue -17deg, back-right gold +17deg, front red with a 3x3 grid of cream
 * diagonal dots and a gold centre). Inline SVG, colours from tokens.
 */
export function PlayBrandMark({ size }: PlayBrandMarkProps): React.ReactElement {
  const { w, h } = DIMS[size];
  const dots = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  return (
    <svg viewBox="0 0 110 85" width={w} height={h} role="img" aria-label="Play OYBC" data-size={size}>
      <g>
        <Card fill="var(--riso-blue)" angle={-17} />
        <Card fill="var(--riso-gold)" angle={17} />
        <Card fill="var(--riso-red)" angle={0} />
        {dots.map((i) => {
          const cx = 40 + (i % 3) * 15;
          const cy = 35 + Math.floor(i / 3) * 15;
          if (i === 4) return <circle key={i} cx={cx} cy={cy} r="4.5" fill="var(--riso-gold)" />;
          if (i % 4 === 0) return <circle key={i} cx={cx} cy={cy} r="3.5" fill="var(--riso-on-color)" />;
          return null;
        })}
      </g>
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
