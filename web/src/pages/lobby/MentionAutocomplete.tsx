import { Avatar } from '../../components/riso/Avatar';
import { RisoCard } from '../../components/riso/RisoCard';
import { RisoIcon } from '../../components/riso/RisoIcon';
import type { MentionOption } from './mentions';
import styles from './MentionAutocomplete.module.css';

/** A suggestion row plus the avatar it wears: a player's own, or for a bound name its player's. */
export interface MentionRow extends MentionOption {
  /** Name + join-order index of the player whose avatar leads the row (player and bound rows). */
  avatar?: { name: string; index: number };
}

/**
 * The 22px leading slot: a solid avatar (player / bound), a dashed hollow circle (unbound), a blue plus
 * (add), or nothing (someone / anyone).
 */
function Lead({ row }: { row: MentionRow }) {
  if (row.avatar) return <Avatar name={row.avatar.name} index={row.avatar.index} size="small" />;
  if (row.kind === 'unbound') return <span className={styles.dashed} aria-hidden="true" />;
  if (row.kind === 'add') return <span className={`${styles.slot} ${styles.plus}`} aria-hidden="true"><RisoIcon name="plus" size={18} /></span>;
  return <span className={styles.slot} aria-hidden="true" />;
}

/** Suggestion card for a mention being typed; picking is by tap or by the form's keyboard handling. */
export function MentionAutocomplete({
  options,
  active,
  onPick,
}: {
  options: MentionRow[];
  active: number;
  onPick: (name: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <RisoCard shadow="small" className={styles.card}>
      <ul className={styles.list} role="listbox" aria-label="Mentions">
        {options.map((o, i) => (
          <li key={`${o.kind}:${o.name}`} role="option" aria-selected={i === active} data-kind={o.kind}>
            <button
              type="button"
              className={i === active ? `${styles.option} ${styles.active}` : styles.option}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(o.name)}
            >
              <Lead row={o} />
              <span className={o.kind === 'unbound' ? `${styles.name} ${styles.muted}` : styles.name}>
                {o.kind !== 'add' && <span className={styles.at} aria-hidden="true">@</span>}
                {o.name}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </RisoCard>
  );
}
