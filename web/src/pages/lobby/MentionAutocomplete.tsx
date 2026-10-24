import { RisoCard } from '../../components/riso/RisoCard';
import styles from './MentionAutocomplete.module.css';

/** Suggestion card for a mention being typed; picking is by tap or by the form's keyboard handling. */
export function MentionAutocomplete({
  options,
  active,
  onPick,
}: {
  options: string[];
  active: number;
  onPick: (name: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <RisoCard shadow="small" className={styles.card}>
      <ul className={styles.list} role="listbox" aria-label="Mentions">
        {options.map((name, i) => (
          <li key={name} role="option" aria-selected={i === active}>
            <button
              type="button"
              className={i === active ? `${styles.option} ${styles.active}` : styles.option}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(name)}
            >
              <span className={styles.at} aria-hidden="true">@</span>{name}
            </button>
          </li>
        ))}
      </ul>
    </RisoCard>
  );
}
