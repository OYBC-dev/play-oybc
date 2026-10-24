import { useCallback, useId, useState } from 'react';
import { errorMessage } from '../../game/errorMessages';
import type { GameClient, GameSnapshot } from '../../game/GameClient';
import { AvatarStack } from '../../components/riso/AvatarStack';
import { HostMenu } from '../host/HostMenu';
import { ReclaimPrompt } from '../host/ReclaimPrompt';
import { AddTaskForm } from './AddTaskForm';
import { MIN_POOL_SIZE } from './constants';
import { LobbySheet } from './LobbySheet';
import { PlayerList } from './PlayerList';
import { PoolList } from './PoolList';
import styles from './LobbyScreen.module.css';

/** Scroll padding under the content when the sheet has not been measured yet. */
const SHEET_FALLBACK_PX = 150;

/** The pre-game lobby: pool header + players, composer, live pool, and the share/launch sheet. */
export function LobbyScreen({ client, snapshot, gameId }: { client: GameClient; snapshot: GameSnapshot; gameId: string }) {
  const { game, mySeatId } = snapshot;
  const isHost = game.hostSeatId === mySeatId;
  const [playersOpen, setPlayersOpen] = useState(false);
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<ReadonlySet<string>>(new Set());
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const playersId = useId();
  const onSheetHeight = useCallback((px: number) => setSheetHeight(px), []);

  const remove = async (id: string) => {
    setDeleteError(null);
    setDeleting((d) => new Set(d).add(id));
    try {
      await client.deleteTask(gameId, id);
    } catch (e) {
      setDeleteError(errorMessage(e));
    } finally {
      setDeleting((d) => { const n = new Set(d); n.delete(id); return n; });
    }
  };

  const seats = [...snapshot.seats].sort((a, b) => a.joinedAt - b.joinedAt);
  const others = seats.filter((s) => s.seatId !== mySeatId).map((s) => s.name);
  const padBottom = sheetHeight === null ? SHEET_FALLBACK_PX : Math.max(130, sheetHeight + 16);

  return (
    <div className={`page ${styles.lobby}`} style={{ paddingBottom: padBottom }} data-testid="stage-lobby">
      {isHost && <ReclaimPrompt client={client} gameId={gameId} reclaims={snapshot.reclaims} />}
      <header className={styles.header}>
        <div className={styles.title}>
          <h1 className={styles.pool}>Pool</h1>
          <span className={styles.count} data-testid="pool-count">{snapshot.view.length} / {MIN_POOL_SIZE}</span>
        </div>
        <AvatarStack seats={seats} max={5} expanded={playersOpen} controls={playersId} onToggle={() => setPlayersOpen((o) => !o)} />
      </header>
      {playersOpen && (
        <PlayerList snapshot={snapshot} id={playersId}>
          <HostMenu client={client} gameId={gameId} snapshot={snapshot} />
        </PlayerList>
      )}
      {seats.length <= 1 && (
        <div className={styles.waiting} role="status">
          Waiting for players
          <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>
        </div>
      )}
      <AddTaskForm client={client} gameId={gameId} seatNames={others} />
      {deleteError && <p className="error" role="alert">{deleteError}</p>}
      <PoolList entries={snapshot.view} isHost={isHost} onDelete={(id) => void remove(id)} deleting={deleting} />
      <LobbySheet snapshot={snapshot} isHost={isHost} onLaunch={() => client.launch(gameId)} onHeight={onSheetHeight} />
    </div>
  );
}
