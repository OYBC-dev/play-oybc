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
  /** Offer "End game" (only while playing: the server ends a playing game only). */
  canEnd: boolean;
}

/**
 * Host-only dots button + popover menu: "Make host" (opens the radio dialog;
 * disabled with no other players) and, when `canEnd`, a red "End game" (opens
 * the confirm dialog). Renders nothing for non-hosts, or when there is no
 * other player and End game is not offered. The popover closes on an
 * outside tap or Escape; focus goes to the first item on open and back to the
 * button on close.
 */
export function HostMenu({ client, gameId, snapshot, canEnd }: HostMenuProps) {
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

  if (snapshot.game.hostSeatId !== snapshot.mySeatId) return null;

  const others = [...snapshot.seats]
    .filter((s) => s.seatId !== snapshot.mySeatId)
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((s) => ({ seatId: s.seatId, name: s.name }));
  // Nothing to offer (lobby, host alone): no button at all. The board keeps a disabled Make host.
  if (!canEnd && others.length === 0) return null;

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
            <button type="button" role="menuitem" className={styles.item} disabled={others.length === 0} onClick={() => choose('make')}>
              <RisoIcon name="you" size={18} />Make host
            </button>
            {canEnd && (
              <>
                <div className={styles.hairline} role="separator" />
                <button type="button" role="menuitem" className={`${styles.item} ${styles.danger}`} onClick={() => choose('end')}>
                  <RisoIcon name="logout" size={18} />End game
                </button>
              </>
            )}
          </div>
        </RisoCard>
      )}
      {dialog === 'make' && (
        <MakeHostDialog client={client} gameId={gameId} candidates={others} onClose={() => setDialog(null)} returnFocus={button} />
      )}
      {dialog === 'end' && canEnd && (
        <EndGameDialog client={client} gameId={gameId} onClose={() => setDialog(null)} returnFocus={button} />
      )}
    </div>
  );
}
