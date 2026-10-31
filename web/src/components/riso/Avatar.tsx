import type { CSSProperties } from 'react';
import { avatarFor } from '../../game/avatars';
import styles from './Avatar.module.css';

export interface AvatarProps {
  name: string;
  /** Join-order index (drives the fill colour). */
  index: number;
  className?: string;
  /**
   * `small` = the 22px row avatar (10px initial, no shadow) used ahead of a mention row;
   * `medium` = the 32px avatar (13px initial) of the lobby sheet's player rows.
   */
  size?: 'default' | 'small' | 'medium';
}

/** 30px initials circle (22px when `small`, 32px when `medium`); colours from `avatarFor`. */
export function Avatar({ name, index, className, size = 'default' }: AvatarProps): React.ReactElement {
  const a = avatarFor({ name }, index);
  const style: CSSProperties = { background: a.fill, color: a.color };
  return (
    <span className={[styles.avatar, size === 'small' ? styles.small : size === 'medium' ? styles.medium : '', className ?? ''].filter(Boolean).join(' ')} style={style} aria-hidden="true">
      {a.initials}
    </span>
  );
}
