import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { dealableFor, tasksPerBoardOf, type GameSnapshot } from '../../game/GameClient';
import { errorMessage } from '../../game/errorMessages';
import { Avatar } from '../../components/riso/Avatar';
import { RisoBadge } from '../../components/riso/RisoBadge';
import { RisoButton } from '../../components/riso/RisoButton';
import { RisoIcon } from '../../components/riso/RisoIcon';
import { Dialog } from '../play/Dialog';
import { useModalFocus } from '../play/useModalFocus';
import { isPoolReady, launchLabel, playerRows, playerWaitingCopy, readinessSummary } from './lobbyReadiness';
import chip from './RosterChip.module.css';
import styles from './LobbySheet.module.css';

/** QR tile colours are static (never themed) so the code always scans. */
const QR_INK = '#18120b';
const QR_PAPER = '#fbf6ea';
/** A handle drag this far (px) expands (up) or collapses (down) the sheet. */
export const DRAG_THRESHOLD_PX = 24;
/** Movement under this (px) is a tap, not a drag. */
const TAP_SLOP_PX = 8;
/** Avatars in the all-set row's stack. */
const ALL_SET_STACK_MAX = 5;

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
function CopyLinkButton({ link, size }: { link: string; size?: 'small' }) {
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
    <RisoButton size={size} icon={<RisoIcon name="share" />} onClick={() => void copy()}>
      {copied ? 'Copied' : 'Copy link'}
    </RisoButton>
  );
}

/** Whether this browser has a native share sheet. */
function canShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** The three bouncing dots of a waiting pill (static under reduced motion, via CSS). */
function Dots() {
  return <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>;
}

/**
 * Pointer handling for the grab handle: a drag up past DRAG_THRESHOLD_PX calls `onUp`, a drag down calls
 * `onDown`; a tap (no real movement) calls `onTap`. The click a drag ends with is swallowed.
 */
function useHandleGestures({ onUp, onDown, onTap }: { onUp?: () => void; onDown?: () => void; onTap: () => void }) {
  const start = useRef<number | null>(null);
  const dragged = useRef(false);
  return {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      start.current = e.clientY;
      dragged.current = false;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
      if (start.current !== null && Math.abs(e.clientY - start.current) >= TAP_SLOP_PX) dragged.current = true;
    },
    onPointerUp: (e: PointerEvent<HTMLButtonElement>) => {
      if (start.current === null) return;
      const dy = e.clientY - start.current;
      start.current = null;
      if (dy <= -DRAG_THRESHOLD_PX) onUp?.();
      else if (dy >= DRAG_THRESHOLD_PX) onDown?.();
    },
    onPointerCancel: () => { start.current = null; },
    onClick: () => {
      if (dragged.current) { dragged.current = false; return; }
      onTap();
    },
  };
}

/** True when `el` has content scrolled out of view below. */
function hasMoreBelow(el: HTMLElement | null): boolean {
  return !!el && el.scrollHeight - el.scrollTop - el.clientHeight > 1;
}

interface ExpandedProps {
  snapshot: GameSnapshot;
  isHost: boolean;
  link: string;
  busy: boolean;
  error: string | null;
  onCollapse: () => void;
  onLaunch: () => void;
  /** Where focus goes on collapse (the control that opened the sheet). */
  returnFocus: RefObject<HTMLElement | null>;
}

/**
 * The expanded sheet: big QR and share, the readiness summary, and the players; Launch (host) or the
 * waiting pill (player) pinned under the scroll region. A modal region: focus moves in, Tab is trapped,
 * Escape / Done / a drag down on the handle collapse it, and focus goes back to the opener.
 */
function ExpandedSheet({ snapshot, isHost, link, busy, error, onCollapse, onLaunch, returnFocus }: ExpandedProps) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const onKeyDown = useModalFocus(ref, onCollapse, returnFocus);
  const [more, setMore] = useState(false);
  const gestures = useHandleGestures({ onDown: onCollapse, onTap: onCollapse });
  const { game } = snapshot;
  const ready = isPoolReady(snapshot);
  const summary = readinessSummary(snapshot, isHost);
  const rows = playerRows(snapshot);
  const target = tasksPerBoardOf(game);
  const waiting = playerWaitingCopy(snapshot);
  const share = canShare();

  const measure = useCallback(() => setMore(hasMoreBelow(scroll.current)), []);
  useLayoutEffect(() => {
    measure();
    const el = scroll.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, rows.length, ready]);

  return (
    <div ref={ref} className={styles.expandedBody} role="dialog" aria-modal="true" aria-label={`Game ${game.code}`} tabIndex={-1} onKeyDown={onKeyDown}>
      <div className={styles.grab}>
        <button type="button" className={styles.handleButton} aria-label="Collapse" aria-expanded="true" {...gestures}>
          <span className={styles.handle} aria-hidden="true" />
        </button>
        <span className={styles.done}><RisoButton kind="ghost" size="small" onClick={onCollapse}>Done</RisoButton></span>
      </div>
      <div className={styles.scrollWrap}>
        <div ref={scroll} className={styles.scroll} onScroll={measure} data-testid="sheet-scroll">
          <section className={styles.share} aria-label="Share">
            <div role="img" aria-label="QR code" className={styles.bigQr}>
              <QRCodeSVG value={link} marginSize={2} fgColor={QR_INK} bgColor={QR_PAPER} className={styles.qrSvg} />
            </div>
            <div className={styles.shareInfo}>
              <span className={styles.label}>Game code</span>
              <div className={styles.bigCode}>{game.code}</div>
              <div className={styles.link}>{link.replace(/^https?:\/\//, '')}</div>
              <div className={styles.shareButtons}>
                <CopyLinkButton link={link} />
                {share && (
                  <RisoButton
                    icon={<RisoIcon name="share" />}
                    onClick={() => { void navigator.share({ title: 'Play OYBC', url: link }).catch(() => {}); }}
                  >
                    Share
                  </RisoButton>
                )}
              </div>
            </div>
          </section>
          <section className={styles.readiness} aria-label="Readiness" data-testid="readiness">
            <div className={styles.readinessRow}>
              <span className={styles.readinessLabel}>{summary.label}</span>
              <span className={styles.readinessSub}>{summary.sub}</span>
            </div>
            <div
              className={styles.bar}
              role="progressbar"
              aria-label="Pool"
              aria-valuemin={0}
              aria-valuemax={summary.target}
              aria-valuenow={Math.min(summary.have, summary.target)}
            >
              <div className={styles.fill} style={{ width: `${summary.percent}%` }} />
            </div>
            {summary.lines.map((l) => (
              <div key={l.text} className={l.short ? `${styles.line} ${styles.lineShort}` : styles.line}>{l.text}</div>
            ))}
          </section>
          <section className={styles.players} aria-label="Players">
            <span className={`${styles.label} ${styles.playersLabel}`}>Players · {rows.length}</span>
            {ready ? (
              <div className={styles.playerRow} data-testid="players-all-set">
                <span className={styles.stack} aria-hidden="true">
                  {[...rows].sort((a, b) => a.index - b.index).slice(0, ALL_SET_STACK_MAX).map((r, i) => (
                    <Avatar key={r.seatId} name={r.name} index={r.index} className={i > 0 ? styles.overlap : undefined} />
                  ))}
                </span>
                <span className={styles.playerName}>{rows.length} {rows.length === 1 ? 'player' : 'players'} · all set</span>
                <span className={styles.playerCount}>{target} / {target}</span>
              </div>
            ) : (
              <ul className={styles.playerList}>
                {rows.map((r) => (
                  <li key={r.seatId} className={styles.playerRow} data-testid="player-row">
                    <Avatar name={r.name} index={r.index} size="medium" />
                    <span className={styles.playerName}>
                      <span className={styles.playerNameText}>{r.name}</span>
                      {r.isHost && <RisoBadge kind="expiring">Host</RisoBadge>}
                    </span>
                    <span className={styles.playerCount}>
                      {r.dealable} / {r.target}
                      {r.short > 0 && <span className={styles.lineShort}> · {r.short} more</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        {more && <div className={styles.fade} aria-hidden="true" data-testid="sheet-fade" />}
      </div>
      {error && <p className={`error ${styles.error}`} role="alert">{error}</p>}
      <div className={styles.footer}>
        {isHost ? (
          <div className={styles.launch}>
            <RisoButton kind={ready ? 'dark' : 'primary'} size="large" fullWidth disabled={!ready || busy} onClick={onLaunch}>
              {launchLabel(snapshot)}
            </RisoButton>
          </div>
        ) : (
          <div className={waiting.ready ? styles.pill : `${styles.pill} ${styles.pillShort}`} role="status" data-testid="player-waiting">
            <span className={styles.pillText}>{waiting.label}</span>
            {waiting.ready && <Dots />}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The lobby's fixed bottom sheet. Collapsed: the game code with the host's shortfall lines (or your
 * `dealable / needed`), and for the host a QR tile and Launch; for a player Copy link, plus a small
 * "Waiting for host" pill once the pool is ready. Dragging the handle up (or tapping it, or the QR tile)
 * expands it (see ExpandedSheet); a scrim tap, Done, Escape or a drag down collapses it. Reports its
 * collapsed height so the page can pad under it. With roster names nobody joined under (`unboundNames`),
 * Launch first asks "Launch?" showing them as dashed chips (launch releases those names: their tasks deal
 * as ordinary ones); without, it fires at once.
 */
export function LobbySheet({
  snapshot,
  isHost,
  onLaunch,
  onHeight,
  unboundNames = [],
}: {
  snapshot: GameSnapshot;
  isHost: boolean;
  onLaunch: () => Promise<void>;
  /** Called with the collapsed sheet's height in px whenever it changes. */
  onHeight?: (px: number) => void;
  /** Host: roster names nobody has yet, in roster order (Launch confirms first when any). */
  unboundNames?: string[];
}) {
  const { game, mySeatId } = snapshot;
  const { code } = game;
  const link = `${window.location.origin}/g/${code}`;
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tileRef = useRef<HTMLButtonElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const [opener, setOpener] = useState<RefObject<HTMLButtonElement | null>>(handleRef);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const lines = isHost ? shortfallLines(snapshot) : [];
  const ready = isPoolReady(snapshot);

  useEffect(() => {
    const el = ref.current;
    if (!el || !onHeight) return;
    const report = () => { if (!expandedRef.current) onHeight(el.offsetHeight); };
    report();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeight]);

  const expand = (from: RefObject<HTMLButtonElement | null>) => {
    setOpener(from);
    setExpanded(true);
  };
  const collapse = useCallback(() => setExpanded(false), []);
  const gestures = useHandleGestures({ onUp: () => expand(handleRef), onTap: () => expand(handleRef) });

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
  const requestLaunch = () => (unboundNames.length > 0 ? setConfirming(true) : void launch());

  const sheetClass = [styles.sheet, ready ? styles.ready : '', expanded ? styles.expanded : ''].filter(Boolean).join(' ');

  return (
    <>
      {expanded && <div className={styles.scrim} onClick={collapse} data-testid="sheet-scrim" />}
      <div ref={ref} className={sheetClass} data-testid="lobby-sheet" data-ready={ready || undefined} data-expanded={expanded || undefined}>
        {expanded ? (
          <ExpandedSheet
            snapshot={snapshot}
            isHost={isHost}
            link={link}
            busy={busy}
            error={error}
            onCollapse={collapse}
            onLaunch={requestLaunch}
            returnFocus={opener}
          />
        ) : (
          <>
            <div className={styles.grab}>
              <button ref={handleRef} type="button" className={styles.handleButton} aria-label="Expand" aria-expanded="false" aria-haspopup="dialog" {...gestures}>
                <span className={styles.handle} aria-hidden="true" />
              </button>
            </div>
            <div className={styles.row}>
              <div className={styles.info}>
                <span className={styles.label}>Game code</span>
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
                  <button
                    ref={tileRef}
                    type="button"
                    className={styles.tile}
                    aria-label="Show QR code"
                    aria-haspopup="dialog"
                    aria-expanded="false"
                    onClick={() => expand(tileRef)}
                  >
                    <QRCodeSVG value={link} marginSize={2} fgColor={QR_INK} bgColor={QR_PAPER} className={styles.qrSvg} />
                  </button>
                  <RisoButton kind={ready ? 'dark' : 'primary'} size="large" disabled={!ready || busy} onClick={requestLaunch}>Launch</RisoButton>
                </>
              ) : (
                <div className={styles.playerActions}>
                  <CopyLinkButton link={link} size="small" />
                  {ready && (
                    <div className={styles.miniPill} role="status" data-testid="player-waiting-mini">
                      Waiting for host
                      <Dots />
                    </div>
                  )}
                </div>
              )}
            </div>
            {error && <p className={`error ${styles.error}`} role="alert">{error}</p>}
          </>
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
