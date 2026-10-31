import { useCallback, useId, useState } from 'react';
import { dealableFor, tasksPerBoardOf, type GameClient, type GameSnapshot } from '../../game/GameClient';
import { AvatarStack } from '../../components/riso/AvatarStack';
import { HostMenu } from '../host/HostMenu';
import { ReclaimPrompt } from '../host/ReclaimPrompt';
import { AddTaskForm } from './AddTaskForm';
import { LobbySheet } from './LobbySheet';
import { PlayerList } from './PlayerList';
import { PoolList } from './PoolList';
import { usePoolEdits } from './usePoolEdits';
import styles from './LobbyScreen.module.css';

/** Scroll padding under the content when the sheet has not been measured yet. */
const SHEET_FALLBACK_PX = 150;

/** The pre-game lobby: pool header + players, game menu, composer, live pool, and the share/launch sheet. */
export function LobbyScreen({ client, snapshot, gameId, onLeave }: {
  client: GameClient; snapshot: GameSnapshot; gameId: string; onLeave: () => void;
}) {
  const { game, mySeatId } = snapshot;
  const isHost = game.hostSeatId === mySeatId;
  const [playersOpen, setPlayersOpen] = useState(false);
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);
  const { rows, add, remove, deleteError } = usePoolEdits(client, gameId, snapshot.view);
  const playersId = useId();
  const onSheetHeight = useCallback((px: number) => setSheetHeight(px), []);

  const seats = [...snapshot.seats].sort((a, b) => a.joinedAt - b.joinedAt);
  const others = seats.filter((s) => s.seatId !== mySeatId).map((s) => s.name);
  const padBottom = sheetHeight === null ? SHEET_FALLBACK_PX : Math.max(130, sheetHeight + 16);

  return (
    <div className={`page ${styles.lobby}`} style={{ paddingBottom: padBottom }} data-testid="stage-lobby" data-focus-fallback tabIndex={-1}>
      {isHost && <ReclaimPrompt client={client} gameId={gameId} reclaims={snapshot.reclaims} />}
      <header className={styles.header}>
        <div className={styles.title}>
          <h1 className={styles.pool}>Pool</h1>
          <span className={styles.count} data-testid="pool-count">{dealableFor(game, mySeatId)} / {tasksPerBoardOf(game)}</span>
          <span className={styles.inPool}>{snapshot.view.length} in pool</span>
        </div>
        <div className={styles.headerActions}>
          <AvatarStack seats={seats} max={5} expanded={playersOpen} controls={playersId} onToggle={() => setPlayersOpen((o) => !o)} />
          <HostMenu client={client} gameId={gameId} snapshot={snapshot} canEnd onLeave={onLeave} />
        </div>
      </header>
      {playersOpen && <PlayerList snapshot={snapshot} id={playersId} />}
      {seats.length <= 1 && (
        <div className={styles.waiting} role="status">
          Waiting for players
          <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>
        </div>
      )}
      <AddTaskForm onAdd={add} seatNames={others} />
      {deleteError && <p className="error" role="alert">{deleteError}</p>}
      <PoolList entries={rows} isHost={isHost} onDelete={(id) => void remove(id)} />
      <LobbySheet
        snapshot={snapshot}
        isHost={isHost}
        onLaunch={() => client.launch(gameId)}
        onFreeSpace={(freeSpace) => client.setOptions(gameId, { freeSpace })}
        onHeight={onSheetHeight}
      />
    </div>
  );
}
