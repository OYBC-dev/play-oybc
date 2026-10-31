import type { CSSProperties } from 'react';
import { avatarFor } from '../../game/avatars';
import styles from './Avatar.module.css';

export interface AvatarProps {
  name: string;
  /** Join-order index (drives the fill colour). */
  index: number;
  className?: string;
  /** `small` = the 22px row avatar (10px initial, no shadow) used ahead of a mention row. */
  size?: 'default' | 'small';
}

/** 30px initials circle (22px when `small`); colours from `avatarFor`. */
export function Avatar({ name, index, className, size = 'default' }: AvatarProps): React.ReactElement {
  const a = avatarFor({ name }, index);
  const style: CSSProperties = { background: a.fill, color: a.color };
  return (
    <span className={[styles.avatar, size === 'small' ? styles.small : '', className ?? ''].filter(Boolean).join(' ')} style={style} aria-hidden="true">
      {a.initials}
    </span>
  );
}
