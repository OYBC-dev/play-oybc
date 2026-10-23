import type { PoolViewEntry } from 'game-core';
import styles from './PoolList.module.css';

/** The shared pool. Entries that mention you arrive without text and render as a redacted bar. */
export function PoolList({
  entries,
  isHost,
  onDelete,
  deleting,
}: {
  entries: PoolViewEntry[];
  isHost: boolean;
  onDelete: (taskId: string) => void;
  /** Task ids with a delete in flight. */
  deleting?: ReadonlySet<string>;
}) {
  return (
    <ul className={styles.list} aria-label="Pool">
      {entries.map((e) => (
        <li key={e.taskId} className={styles.entry} data-blurred={e.text === null || undefined}>
          <div className={styles.body}>
            {e.text === null ? (
              <span className={styles.redacted} data-testid="redacted" aria-label="Hidden task" role="img" />
            ) : (
              <span className={styles.text}>{e.text}</span>
            )}
            <span className={styles.author}>{e.mine ? 'You' : e.authorName}</span>
          </div>
          {(e.mine || isHost) && (
            <button type="button" className={styles.delete} aria-label={e.text === null ? `Delete hidden task by ${e.authorName}` : `Delete task: ${e.text}`} disabled={deleting?.has(e.taskId)} onClick={() => onDelete(e.taskId)}>
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
