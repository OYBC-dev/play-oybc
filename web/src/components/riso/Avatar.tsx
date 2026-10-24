import type { CSSProperties } from 'react';
import { avatarFor } from '../../game/avatars';
import styles from './Avatar.module.css';

export interface AvatarProps {
  name: string;
  /** Join-order index (drives the fill colour). */
  index: number;
  className?: string;
}

/** 30px initials circle; colours from `avatarFor`. */
export function Avatar({ name, index, className }: AvatarProps): React.ReactElement {
  const a = avatarFor({ name }, index);
  const style: CSSProperties = { background: a.fill, color: a.color };
  return (
    <span className={`${styles.avatar} ${className ?? ''}`} style={style} aria-hidden="true">
      {a.initials}
    </span>
  );
}
