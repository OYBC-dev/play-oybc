import { useLayoutEffect, useRef, useState } from 'react';
import type { GameClient } from '../../game/GameClient';
import { appErrorCode, errorMessage } from '../../game/errorMessages';
import { RisoButton } from '../../components/riso/RisoButton';
import { MAX_TASK_LENGTH } from './constants';
import { MentionAutocomplete } from './MentionAutocomplete';
import { activeMention, findUnknownMention, mentionOptions } from './mentions';
import styles from './AddTaskForm.module.css';

/** Task entry with @mention autocomplete; sends through the client and shows server errors inline. */
export function AddTaskForm({
  client,
  gameId,
  seatNames,
}: {
  client: GameClient;
  gameId: string;
  /** Names of the other players (not you), in display order. */
  seatNames: string[];
}) {
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);

  const mention = dismissed ? null : activeMention(text, caret);
  const options = mention ? mentionOptions(mention.partial, seatNames) : [];
  const active = Math.min(index, Math.max(options.length - 1, 0));

  useLayoutEffect(() => {
    if (pendingCaret.current !== null && input.current) {
      input.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  });

  const pick = (name: string) => {
    if (!mention) return;
    const insert = `@${name} `;
    const next = text.slice(0, mention.start) + insert + text.slice(caret);
    const pos = mention.start + insert.length;
    setText(next.slice(0, MAX_TASK_LENGTH));
    setCaret(pos);
    pendingCaret.current = pos;
    setIndex(0);
    input.current?.focus();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      await client.addTask(gameId, body);
      setText('');
      setCaret(0);
    } catch (err) {
      const token = appErrorCode(err) === 'unknown-mention' ? findUnknownMention(body, seatNames) : null;
      setError(token ? `No player named ${token}` : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (options.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((active + 1) % options.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((active - 1 + options.length) % options.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(options[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); setDismissed(true); }
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.label}>
        <span className={styles.visually}>Task</span>
        <input
          ref={input}
          className={styles.input}
          value={text}
          maxLength={MAX_TASK_LENGTH}
          placeholder="Something that might happen"
          autoComplete="off"
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
            setIndex(0);
            setDismissed(false);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onKeyDown={onKeyDown}
        />
      </label>
      <MentionAutocomplete options={options} active={active} onPick={pick} />
      {error && <p className="error" role="alert">{error}</p>}
      <RisoButton type="submit" kind="primary" disabled={busy || !text.trim()} fullWidth>Add</RisoButton>
    </form>
  );
}
