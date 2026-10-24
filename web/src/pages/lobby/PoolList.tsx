import type { PoolViewEntry } from 'game-core';
import { RisoCard } from '../../components/riso/RisoCard';
import { RisoIcon } from '../../components/riso/RisoIcon';
import { RisoMiniBoardArt } from '../../components/riso/RisoMiniBoardArt';
import { nonsenseFor } from './nonsense';
import styles from './PoolList.module.css';

/**
 * Two mis-registered blurred copies of a per-task nonsense string. The client never
 * has the hidden text; screen readers hear "Hidden task".
 */
function BlurredText({ taskId }: { taskId: string }) {
  const fake = nonsenseFor(taskId);
  return (
    <div className={styles.blurred} data-testid="redacted" role="img" aria-label="Hidden task">
      <span className={styles.red} aria-hidden="true">{fake}</span>
      <span className={styles.blue} aria-hidden="true">{fake}</span>
    </div>
  );
}

/** The shared pool in one card. Rows that mention you arrive without text and render blurred. */
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
  if (entries.length === 0) {
    return (
      <RisoCard padded className={styles.empty}>
        <RisoMiniBoardArt cellSize={20} />
        <p className={styles.emptyText}>No tasks yet</p>
      </RisoCard>
    );
  }
  return (
    <RisoCard className={styles.card}>
      <ul className={styles.list} aria-label="Pool">
        {entries.map((e) => (
          <li key={e.taskId} className={styles.entry} data-blurred={e.text === null || undefined}>
            <div className={styles.body}>
              {e.text === null ? <BlurredText taskId={e.taskId} /> : <span className={styles.text}>{e.text}</span>}
              <span className={styles.author}>{e.mine ? 'You' : e.authorName}</span>
            </div>
            {(e.mine || isHost) && (
              <button
                type="button"
                className={styles.delete}
                aria-label={e.text === null ? `Delete hidden task by ${e.authorName}` : `Delete task: ${e.text}`}
                disabled={deleting?.has(e.taskId)}
                onClick={() => onDelete(e.taskId)}
              >
                <RisoIcon name="trash" size={18} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </RisoCard>
  );
}
