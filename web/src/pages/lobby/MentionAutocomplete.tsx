import { RisoCard } from '../../components/riso/RisoCard';
import type { MentionOption } from './mentions';
import styles from './MentionAutocomplete.module.css';

/** The glyph ahead of a row's name: `+` for a new name, a dashed `@` for a name nobody has yet, else `@`. */
function Glyph({ kind }: { kind: MentionOption['kind'] }) {
  if (kind === 'add') return <span className={styles.plus} aria-hidden="true">+</span>;
  return <span className={kind === 'unbound' ? `${styles.at} ${styles.unbound}` : styles.at} aria-hidden="true">@</span>;
}

/** Suggestion card for a mention being typed; picking is by tap or by the form's keyboard handling. */
export function MentionAutocomplete({
  options,
  active,
  onPick,
}: {
  options: MentionOption[];
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
              <Glyph kind={o.kind} />
              <span className={styles.name}>{o.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </RisoCard>
  );
}
