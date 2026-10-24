import { Avatar } from './Avatar';
import styles from './AvatarStack.module.css';

export interface AvatarStackProps {
  /** Seats in join order. */
  seats: Array<{ name: string }>;
  /** Max avatars shown before the "+N" bubble. */
  max?: number;
  onToggle: () => void;
}

/** Overlapping avatars with a "+N" overflow bubble; the whole stack is one button. */
export function AvatarStack({ seats, max = 4, onToggle }: AvatarStackProps): React.ReactElement {
  const shown = seats.slice(0, max);
  const extra = seats.length - shown.length;
  return (
    <button
      type="button"
      className={styles.stack}
      onClick={onToggle}
      aria-label={`${seats.length} ${seats.length === 1 ? 'player' : 'players'}`}
    >
      {shown.map((s, i) => (
        <Avatar key={i} name={s.name} index={i} className={i > 0 ? styles.overlap : ''} />
      ))}
      {extra > 0 && <span className={`${styles.more} ${styles.overlap}`}>+{extra}</span>}
    </button>
  );
}
