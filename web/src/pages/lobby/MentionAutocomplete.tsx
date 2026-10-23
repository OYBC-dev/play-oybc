import styles from './MentionAutocomplete.module.css';

/** Suggestion list for a mention being typed; picking is by tap or by the form's keyboard handling. */
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
    <ul className={styles.list} role="listbox" aria-label="Mentions">
      {options.map((name, i) => (
        <li key={name} role="option" aria-selected={i === active}>
          <button
            type="button"
            className={i === active ? `${styles.option} ${styles.active}` : styles.option}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(name)}
          >
            {name}
          </button>
        </li>
      ))}
    </ul>
  );
}
