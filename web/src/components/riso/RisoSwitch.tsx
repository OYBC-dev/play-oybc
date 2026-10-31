import type { InputHTMLAttributes } from 'react';
import styles from './RisoSwitch.module.css';

export interface RisoSwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role' | 'className'> {
  checked: boolean;
}

/**
 * Riso on/off switch: a native checkbox with `role="switch"` (so it keeps keyboard and form behaviour),
 * drawn as a pill track with a knob. Name it with a wrapping `<label>` or `aria-label`.
 */
export function RisoSwitch(props: RisoSwitchProps): React.ReactElement {
  return <input type="checkbox" role="switch" className={styles.switch} {...props} />;
}
