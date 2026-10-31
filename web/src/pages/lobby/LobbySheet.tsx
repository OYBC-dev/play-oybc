import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { dealableFor, freeSpaceOf, tasksPerBoardOf, type GameSnapshot } from '../../game/GameClient';
import { errorMessage } from '../../game/errorMessages';
import { RisoButton } from '../../components/riso/RisoButton';
import { RisoIcon } from '../../components/riso/RisoIcon';
import { RisoSectionLabel } from '../../components/riso/RisoSectionLabel';
import { Dialog } from '../play/Dialog';
import chip from './RosterChip.module.css';
import styles from './LobbySheet.module.css';

/** QR tile colours are static (never themed) so the code always scans. */
const QR_INK = '#18120b';
const QR_PAPER = '#fbf6ea';

/**
 * "{Name} needs {n} more task(s)" for every seat short of a full board, sorted.
 *
 * @param snapshot Current game snapshot; reads `game.shortfalls` and `seats`.
 * @returns One line per seat that still needs tasks.
 */
export function shortfallLines(snapshot: GameSnapshot): string[] {
  const names = new Map(snapshot.seats.map((s) => [s.seatId, s.name]));
  return Object.entries(snapshot.game.shortfalls)
    .filter(([, n]) => n > 0)
    .map(([seatId, n]) => `${names.get(seatId) ?? 'Someone'} needs ${n} more task${n === 1 ? '' : 's'}`)
    .sort();
}

/** How long the "Copied" label stays before reverting to "Copy link". */
export const COPIED_MS = 2000;

/** Copies the join link; the label reads "Copied" for COPIED_MS once it worked. */
function CopyLinkButton({ link, size, fullWidth }: { link: string; size?: 'small'; fullWidth?: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = async () => {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      setCopied(false);
    }
  };
  return (
    <RisoButton size={size} fullWidth={fullWidth} icon={<RisoIcon name="share" />} onClick={() => void copy()}>
      {copied ? 'Copied' : 'Copy link'}
    </RisoButton>
  );
}

/**
 * The host's Free space switch: bound to `game.freeSpace`, never flipped ahead of the server;
 * disabled while the change is in flight.
 */
function FreeSpaceRow({ on, onChange }: { on: boolean; onChange: (freeSpace: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await onChange(next);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <label className={styles.option}>
        <span className={styles.optionLabel}>Free space</span>
        <input
          type="checkbox"
          role="switch"
          className={styles.switch}
          checked={on}
          disabled={busy}
          onChange={(e) => void change(e.currentTarget.checked)}
        />
      </label>
      {error && <p className={`error ${styles.error}`} role="alert">{error}</p>}
    </>
  );
}

/**
 * The lobby's fixed bottom sheet: game code with your `dealable / needed` count, and for the host the
 * shortfall lines, a QR tile that expands to a large QR with Copy link / Done, the Free space switch,
 * and Launch. Players get the code and Copy link. Reports its rendered height so the page can pad under it.
 * With roster names nobody joined under (`unboundNames`), Launch first asks "Launch?" showing them as
 * dashed chips (launch releases those names: their tasks deal as ordinary ones); without, it fires at once.
 */
export function LobbySheet({
  snapshot,
  isHost,
  onLaunch,
  onFreeSpace,
  onHeight,
  unboundNames = [],
}: {
  snapshot: GameSnapshot;
  isHost: boolean;
  onLaunch: () => Promise<void>;
  /** Host only: asks the server to turn free space on or off. */
  onFreeSpace?: (freeSpace: boolean) => Promise<void>;
  /** Called with the sheet's height in px whenever it changes. */
  onHeight?: (px: number) => void;
  /** Host: roster names nobody has yet, in roster order (Launch confirms first when any). */
  unboundNames?: string[];
}) {
  const { game, mySeatId } = snapshot;
  const { code } = game;
  const link = `${window.location.origin}/g/${code}`;
  const [qrOpen, setQrOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const lines = isHost ? shortfallLines(snapshot) : [];
  const ready = isHost && game.stage === 'lobby' && lines.length === 0;

  useEffect(() => {
    const el = ref.current;
    if (!el || !onHeight) return;
    onHeight(el.offsetHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeight]);

  const launch = async () => {
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      await onLaunch();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div ref={ref} className={ready ? `${styles.sheet} ${styles.ready}` : styles.sheet} data-testid="lobby-sheet" data-ready={ready || undefined}>
        <div className={styles.handle} aria-hidden="true" />
        {isHost && onFreeSpace && <FreeSpaceRow on={freeSpaceOf(game)} onChange={onFreeSpace} />}
        <div className={styles.row}>
          <div className={styles.info}>
            <RisoSectionLabel>Game code</RisoSectionLabel>
            <div className={styles.code} aria-label="Game code">{code}</div>
            {lines.length > 0 && (
              <div className={styles.shorts} data-testid="shortfalls">
                {lines.map((l) => <div key={l} className={styles.short}>{l}</div>)}
              </div>
            )}
            {lines.length === 0 && <div className={styles.count}>{dealableFor(game, mySeatId)} / {tasksPerBoardOf(game)}</div>}
          </div>
          {isHost ? (
            <>
              <button type="button" className={styles.tile} aria-label="Share" aria-expanded={qrOpen} onClick={() => setQrOpen((o) => !o)}>
                <QRCodeSVG value={link} marginSize={2} fgColor={QR_INK} bgColor={QR_PAPER} className={styles.qrSvg} />
              </button>
              <RisoButton kind={ready ? 'dark' : 'primary'} size="large" disabled={!ready || busy} onClick={() => (unboundNames.length > 0 ? setConfirming(true) : void launch())}>Launch</RisoButton>
            </>
          ) : (
            <CopyLinkButton link={link} size="small" />
          )}
        </div>
        {error && <p className={`error ${styles.error}`} role="alert">{error}</p>}
        {isHost && qrOpen && (
          <div className={styles.expanded}>
            <div role="img" aria-label="QR code" className={styles.bigQr}>
              <QRCodeSVG value={link} marginSize={2} fgColor={QR_INK} bgColor={QR_PAPER} className={styles.qrSvg} />
            </div>
            <div className={styles.actions}>
              <CopyLinkButton link={link} fullWidth />
              <RisoButton kind="ghost" fullWidth onClick={() => setQrOpen(false)}>Done</RisoButton>
            </div>
          </div>
        )}
      </div>
      {confirming && (
        <Dialog title="Launch?" onClose={() => setConfirming(false)}>
          <ul className={styles.unbound} aria-label="Nobody yet">
            {unboundNames.map((n) => (
              <li key={n} className={chip.chip}><span className={chip.text}>{n}</span></li>
            ))}
          </ul>
          <div className={styles.confirmActions}>
            <RisoButton kind="ghost" fullWidth onClick={() => setConfirming(false)}>Cancel</RisoButton>
            <RisoButton kind="dark" fullWidth onClick={() => void launch()}>Launch</RisoButton>
          </div>
        </Dialog>
      )}
    </>
  );
}
