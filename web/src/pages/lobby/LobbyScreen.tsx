import { useCallback, useId, useRef, useState } from 'react';
import { dealableFor, tasksPerBoardOf, type GameClient, type GameSnapshot } from '../../game/GameClient';
import { AvatarStack } from '../../components/riso/AvatarStack';
import { HostMenu } from '../host/HostMenu';
import { ReclaimPrompt } from '../host/ReclaimPrompt';
import { AddTaskForm } from './AddTaskForm';
import { BindNameSheet } from './BindNameSheet';
import { hasSeenHowTo, markHowToSeen, shouldAutoOpenHowTo } from './howTo';
import { HowToDialog } from './HowToDialog';
import { authoredCount } from './lobbyReadiness';
import { LobbySheet } from './LobbySheet';
import { PlayerList } from './PlayerList';
import { PoolList } from './PoolList';
import { useNarrow } from './useNarrow';
import { usePoolEdits } from './usePoolEdits';
import styles from './LobbyScreen.module.css';

/** Scroll padding under the content when the sheet has not been measured yet. */
const SHEET_FALLBACK_PX = 150;
/** Avatars before "+N": 5, or 3 on a phone (the Pool title collides with 5 at 390px). */
const STACK_MAX = 5;
const STACK_MAX_NARROW = 3;

/** The pre-game lobby: pool header + players, game menu, composer, live pool, and the share/launch sheet. */
export function LobbyScreen({ client, snapshot, gameId, onLeave }: {
  client: GameClient; snapshot: GameSnapshot; gameId: string; onLeave: () => void;
}) {
  const { game, mySeatId } = snapshot;
  const isHost = game.hostSeatId === mySeatId;
  const [playersOpen, setPlayersOpen] = useState(false);
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);
  const [bindingKey, setBindingKey] = useState<string | null>(null);
  const { rows, add, remove, deleteError } = usePoolEdits(client, gameId, snapshot.view);
  const playersId = useId();
  const onSheetHeight = useCallback((px: number) => setSheetHeight(px), []);
  const narrow = useNarrow();
  const taskInput = useRef<HTMLInputElement>(null);
  const howToBubble = useRef<HTMLButtonElement>(null);
  // "How tasks work": opens by itself once per device (first lobby, no tasks of ours yet), and from the (i) bubble.
  const [howTo, setHowTo] = useState<'first' | 'info' | null>(() => (
    shouldAutoOpenHowTo({ seen: hasSeenHowTo(), stage: game.stage, authored: authoredCount(snapshot) }) ? 'first' : null
  ));
  const closeHowTo = useCallback(() => {
    markHowToSeen();
    setHowTo(null);
  }, []);

  const seats = [...snapshot.seats].sort((a, b) => a.joinedAt - b.joinedAt);
  const others = seats.filter((s) => s.seatId !== mySeatId).map((s) => s.name);
  const myName = seats.find((s) => s.seatId === mySeatId)?.name;
  const roster = snapshot.roster ?? [];
  const seatIds = new Set(seats.map((s) => s.seatId));
  const unboundNames = roster.filter((r) => r.seatId === null || !seatIds.has(r.seatId)).map((r) => r.display);
  // Live row for the open sheet; a name that left the roster (retired, its tasks deleted) closes it.
  const binding = isHost && bindingKey !== null ? roster.find((r) => r.key === bindingKey) ?? null : null;
  const padBottom = sheetHeight === null ? SHEET_FALLBACK_PX : Math.max(130, sheetHeight + 16);

  return (
    <div className={`page ${styles.lobby}`} style={{ paddingBottom: padBottom }} data-testid="stage-lobby" data-focus-fallback tabIndex={-1}>
      {isHost && <ReclaimPrompt client={client} gameId={gameId} reclaims={snapshot.reclaims} />}
      <header className={styles.header}>
        <div className={styles.title}>
          <div className={styles.titleRow}>
            <h1 className={styles.pool}>Pool</h1>
            <span className={styles.count} data-testid="pool-count">{dealableFor(game, mySeatId)} / {tasksPerBoardOf(game)}</span>
            <span className={styles.inPool}>{snapshot.view.length} in pool</span>
          </div>
          {game.gameName && <p className={styles.gameName} data-testid="game-name">{game.gameName}</p>}
        </div>
        <div className={styles.headerActions}>
          <AvatarStack seats={seats} max={narrow ? STACK_MAX_NARROW : STACK_MAX} expanded={playersOpen} controls={playersId} onToggle={() => setPlayersOpen((o) => !o)} />
          <HostMenu client={client} gameId={gameId} snapshot={snapshot} canEnd onLeave={onLeave} onOpenRoster={() => setPlayersOpen(true)} />
        </div>
      </header>
      {playersOpen && <PlayerList snapshot={snapshot} id={playersId} isHost={isHost} onOpenName={setBindingKey} />}
      {binding && (
        <BindNameSheet client={client} gameId={gameId} name={binding} seats={seats} onClose={() => setBindingKey(null)} />
      )}
      {seats.length <= 1 && (
        <div className={styles.waiting} role="status">
          Waiting for players
          <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>
        </div>
      )}
      <AddTaskForm
        onAdd={add}
        seatNames={others}
        roster={roster}
        myName={myName}
        seats={seats}
        mySeatId={mySeatId}
        onHowTo={() => setHowTo('info')}
        inputRef={taskInput}
        howToRef={howToBubble}
      />
      {deleteError && <p className="error" role="alert">{deleteError}</p>}
      <PoolList entries={rows} isHost={isHost} onDelete={(id) => void remove(id)} />
      <LobbySheet
        snapshot={snapshot}
        isHost={isHost}
        onLaunch={() => client.launch(gameId)}
        onHeight={onSheetHeight}
        unboundNames={isHost ? unboundNames : []}
      />
      {howTo && game.stage === 'lobby' && (
        <HowToDialog
          firstJoin={howTo === 'first'}
          name={myName}
          onClose={closeHowTo}
          returnFocus={howTo === 'first' ? taskInput : howToBubble}
        />
      )}
    </div>
  );
}
