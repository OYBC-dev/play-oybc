import type { RefObject } from 'react';
import { RisoButton } from '../../components/riso/RisoButton';
import { Dialog } from '../play/Dialog';
import styles from './HowToDialog.module.css';

/** One task kind: its pill, who sees it, who it is dealt to (`em` is the italic placeholder, e.g. Name). */
interface TaskKind {
  tag: string;
  tone: 'plain' | 'named' | 'someone' | 'anyone';
  seen: { text: string; em?: string };
  dealt: { text: string; em?: string };
}

/** The four kinds, per docs/DESIGN.md §4.3 and docs/PARTY_FEATURES.md §2: two facts each, no examples. */
export const TASK_KINDS: readonly TaskKind[] = [
  { tag: 'Plain', tone: 'plain', seen: { text: 'Everyone' }, dealt: { text: 'Everyone' } },
  { tag: '@Name', tone: 'named', seen: { text: 'Everyone except ', em: 'Name' }, dealt: { text: 'Everyone except ', em: 'Name' } },
  { tag: '@someone', tone: 'someone', seen: { text: 'Only you' }, dealt: { text: 'A random player on each board' } },
  { tag: '@anyone', tone: 'anyone', seen: { text: 'Only you' }, dealt: { text: 'One board · counts when anyone but its owner does it' } },
];

/**
 * "How tasks work": the four kinds of task as cards. `firstJoin` is the automatic first-lobby opening
 * (kicker `Welcome, {name}`, button `Got it, let's add some`); otherwise it was opened from the (i) bubble
 * (kicker `Pool`, button `Done`). Escape, a scrim tap and the button all close it.
 */
export function HowToDialog({ firstJoin, name, onClose, returnFocus }: {
  firstJoin: boolean;
  /** This seat's name, for the first-join kicker. */
  name?: string;
  onClose: () => void;
  /** Where focus goes on close: the composer input on first join, the bubble otherwise. */
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  const kicker = firstJoin ? (name ? `Welcome, ${name}` : 'Welcome') : 'Pool';
  return (
    <Dialog title="Four kinds of task" kicker={kicker} onClose={onClose} returnFocus={returnFocus} className={styles.card}>
      <ul className={styles.kinds} aria-label="Task kinds">
        {TASK_KINDS.map((k) => (
          <li key={k.tag} className={styles.kind}>
            <span className={`${styles.tag} ${styles[k.tone]}`}>{k.tag}</span>
            <span className={styles.fact}>
              <span className={styles.factLabel}>Seen by</span>
              {k.seen.text}{k.seen.em && <em className={styles.em}>{k.seen.em}</em>}
            </span>
            <span className={styles.fact}>
              <span className={styles.factLabel}>Dealt to</span>
              {k.dealt.text}{k.dealt.em && <em className={styles.em}>{k.dealt.em}</em>}
            </span>
          </li>
        ))}
      </ul>
      <RisoButton kind="dark" size="large" fullWidth onClick={onClose}>
        {firstJoin ? "Got it, let's add some" : 'Done'}
      </RisoButton>
    </Dialog>
  );
}
