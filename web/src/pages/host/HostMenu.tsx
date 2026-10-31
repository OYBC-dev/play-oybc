import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { RisoCard } from '../../components/riso/RisoCard';
import { RisoIcon } from '../../components/riso/RisoIcon';
import type { GameClient, GameSnapshot } from '../../game/GameClient';
import { EndGameDialog } from './EndGameDialog';
import { MakeHostDialog } from './MakeHostDialog';
import styles from './host.module.css';

export interface HostMenuProps {
  client: GameClient;
  gameId: string;
  snapshot: GameSnapshot;
  /** Offer the host "End game" (the server ends a game from the lobby or while playing). */
  canEnd: boolean;
  /** "Leave game": lets go of the game on this device and goes Home (the seat stays; rejoin by code). */
  onLeave: () => void;
  /**
   * Lobby only: the host's "Roster" item, which expands the player chip list (where the dashed chips and
   * tags open the bind sheet). Omitted = no Roster item (in play the roster is read-only).
   */
  onOpenRoster?: () => void;
}

/**
 * The game menu, for every seat: a dots button + popover. The host gets
 * "Make host" (opens the radio dialog; disabled with no other players), in the
 * lobby "Roster" (expands the chip list; a dashed bubble counts the unbound
 * names, hidden at 0) and, when `canEnd`, a red "End game" (opens the confirm
 * dialog); everyone gets
 * "Leave game" (calls `onLeave`, no confirm). The popover closes on an
 * outside tap or Escape; focus goes to the first item on open and back to the
 * button on close.
 */
export function HostMenu({ client, gameId, snapshot, canEnd, onLeave, onOpenRoster }: HostMenuProps) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'make' | 'end' | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const first = menu.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)');
    (first ?? menu.current)?.focus();
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const isHost = snapshot.game.hostSeatId === snapshot.mySeatId;
  const others = [...snapshot.seats]
    .filter((s) => s.seatId !== snapshot.mySeatId)
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((s) => ({ seatId: s.seatId, name: s.name }));
  const seatIds = new Set(snapshot.seats.map((s) => s.seatId));
  const unbound = (snapshot.roster ?? []).filter((r) => r.seatId === null || !seatIds.has(r.seatId)).length;
  const showRoster = onOpenRoster !== undefined && snapshot.game.stage === 'lobby';
  const closeMenu = () => { setOpen(false); button.current?.focus(); };
  const choose = (d: 'make' | 'end') => { setOpen(false); setDialog(d); };

  const onMenuKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault();
      e.stopPropagation();
      closeMenu();
      return;
    }
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])];
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const to = e.key === 'ArrowDown' ? (at + 1) % items.length
      : e.key === 'ArrowUp' ? (at - 1 + items.length) % items.length
        : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    items[to].focus();
  };

  return (
    <div ref={wrap} className={styles.menuWrap}>
      <button
        ref={button}
        type="button"
        className={styles.dots}
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? closeMenu() : setOpen(true))}
      >
        <RisoIcon name="dots" size={20} />
      </button>
      {open && (
        <RisoCard shadow="large" className={styles.menu}>
          <div ref={menu} id={menuId} role="menu" aria-label="Menu" tabIndex={-1} className={styles.menuList} onKeyDown={onMenuKey}>
            {isHost && (
              <>
                <button type="button" role="menuitem" className={styles.item} disabled={others.length === 0} onClick={() => choose('make')}>
                  <RisoIcon name="you" size={18} />Make host
                </button>
                {showRoster && (
                  <button type="button" role="menuitem" className={styles.item} onClick={() => { setOpen(false); onOpenRoster(); }}>
                    <RisoIcon name="list" size={18} />Roster
                    {unbound > 0 && <span className={styles.count} data-testid="roster-unbound-count">{unbound}</span>}
                  </button>
                )}
                {canEnd && (
                  <button type="button" role="menuitem" className={`${styles.item} ${styles.danger}`} onClick={() => choose('end')}>
                    <RisoIcon name="logout" size={18} />End game
                  </button>
                )}
                <div className={styles.hairline} role="separator" />
              </>
            )}
            <button type="button" role="menuitem" className={styles.item} onClick={() => { setOpen(false); onLeave(); }}>
              <RisoIcon name="back" size={18} />Leave game
            </button>
          </div>
        </RisoCard>
      )}
      {dialog === 'make' && isHost && (
        <MakeHostDialog client={client} gameId={gameId} candidates={others} onClose={() => setDialog(null)} returnFocus={button} />
      )}
      {dialog === 'end' && isHost && canEnd && (
        <EndGameDialog
          client={client} gameId={gameId} onClose={() => setDialog(null)} returnFocus={button}
          inLobby={snapshot.game.stage === 'lobby'}
        />
      )}
    </div>
  );
}
