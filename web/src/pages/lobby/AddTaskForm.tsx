import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { RosterName } from 'game-core';
import { errorMessage } from '../../game/errorMessages';
import { RisoButton } from '../../components/riso/RisoButton';
import { MAX_TASK_LENGTH } from './constants';
import { MentionAutocomplete, type MentionRow } from './MentionAutocomplete';
import { activeMention, mentionOptions } from './mentions';
import styles from './AddTaskForm.module.css';

/** Adds the avatar a row wears: the player's own, or for a bound name the player it is bound to. */
function withAvatar(o: MentionRow, seats: ReadonlyArray<{ seatId: string; name: string }>): MentionRow {
  const index = o.kind === 'player' ? seats.findIndex((s) => s.name === o.name)
    : o.kind === 'bound' ? seats.findIndex((s) => s.seatId === o.seatId) : -1;
  return index < 0 ? o : { ...o, avatar: { name: seats[index].name, index } };
}

/**
 * Task entry with @mention autocomplete; sends through `onAdd` and shows server errors inline.
 *
 * Keyboard: arrows move through the suggestions; Enter picks the active row, except the `+ Name` add row:
 * there Enter submits the task as typed (the server takes an unknown name and adds it to the roster), so
 * a Return meant to send never turns into a pick. The add row is picked only by tap.
 */
export function AddTaskForm({
  onAdd,
  seatNames,
  roster = [],
  myName,
  seats = [],
  mySeatId,
  onHowTo,
  inputRef,
  howToRef,
}: {
  /** Adds the trimmed text to the pool; rejects with the server error. */
  onAdd: (text: string) => Promise<void>;
  /** Names of the other players (not you), in display order. */
  seatNames: string[];
  /** The snapshot's roster: names tasks use that no player owns. */
  roster?: RosterName[];
  /** Your own name (never offered as a new name). */
  myName?: string;
  /** Every seat in join order, you included: gives each row its avatar (index = join order). */
  seats?: ReadonlyArray<{ seatId: string; name: string }>;
  /** Your seat: a roster name bound to you is not offered (it would mention yourself). */
  mySeatId?: string;
  /** Opens "How tasks work"; when given, an (i) bubble follows Add. */
  onHowTo?: () => void;
  /** Receives the task input (focus returns here when the first-join explainer closes). */
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Receives the (i) bubble (focus returns here when the explainer it opened closes). */
  howToRef?: RefObject<HTMLButtonElement | null>;
}) {
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ownInput = useRef<HTMLInputElement>(null);
  const input = inputRef ?? ownInput;
  const pendingCaret = useRef<number | null>(null);
  const latest = useRef(text);
  latest.current = text;

  const mention = dismissed ? null : activeMention(text, caret);
  const options: MentionRow[] = mention
    ? mentionOptions(mention.partial, seatNames, roster, myName === undefined ? seatNames : [...seatNames, myName], {
      selfSeatId: mySeatId ?? null,
      seatIds: seats.length > 0 ? new Set(seats.map((s) => s.seatId)) : undefined,
    }).map((o) => withAvatar(o, seats))
    : [];
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
      await onAdd(body);
      // Keep anything typed while the call was in flight.
      if (latest.current === text) { setText(''); setCaret(0); }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (options.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((active + 1) % options.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((active - 1 + options.length) % options.length); }
    else if (e.key === 'Enter') {
      // On the add row Return sends the task as typed (the form's submit); it never picks.
      if (options[active].kind === 'add') return;
      e.preventDefault();
      pick(options[active].name);
    }
    else if (e.key === 'Escape') { e.preventDefault(); setDismissed(true); }
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.composer}>
        <div className={styles.row}>
          <input
            ref={input}
            className={styles.input}
            aria-label="Task"
            value={text}
            maxLength={MAX_TASK_LENGTH}
            placeholder="Add to the pool"
            autoComplete="off"
            onChange={(e) => {
              setText(e.target.value);
              setCaret(e.target.selectionStart ?? e.target.value.length);
              setIndex(0);
              setDismissed(false);
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
            onKeyDown={onKeyDown}
            onBlur={() => setDismissed(true)}
          />
          <RisoButton type="submit" disabled={busy || !text.trim()}>Add</RisoButton>
          {onHowTo && (
            <button ref={howToRef} type="button" className={styles.info} aria-label="How tasks work" onClick={onHowTo}>
              <span className={styles.infoGlyph} aria-hidden="true">i</span>
            </button>
          )}
        </div>
        <MentionAutocomplete options={options} active={active} onPick={pick} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
