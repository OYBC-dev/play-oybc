import { useState } from 'react';
import { errorMessage } from '../../game/errorMessages';
import type { GameClient, GameSnapshot } from '../../game/GameClient';
import { RisoSectionLabel } from '../../components/riso/RisoSectionLabel';
import { AddTaskForm } from './AddTaskForm';
import { LaunchBar } from './LaunchBar';
import { PlayerList } from './PlayerList';
import { PoolList } from './PoolList';
import { ShareCard } from './ShareCard';
import styles from './LobbyScreen.module.css';

/** The pre-game lobby: share, players, live pool, task entry, and (host) launch. */
export function LobbyScreen({ client, snapshot, gameId }: { client: GameClient; snapshot: GameSnapshot; gameId: string }) {
  const { game, mySeatId } = snapshot;
  const isHost = game.hostSeatId === mySeatId;
  const [deleting, setDeleting] = useState<ReadonlySet<string>>(new Set());
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
  const others = snapshot.seats.filter((s) => s.seatId !== mySeatId).map((s) => s.name);

  return (
    <div className="page" data-testid="stage-lobby">
      <ShareCard code={game.code} isHost={isHost} />
      <section className={styles.section}>
        <RisoSectionLabel>Players</RisoSectionLabel>
        <PlayerList snapshot={snapshot} />
      </section>
      <section className={styles.section}>
        <RisoSectionLabel>Pool</RisoSectionLabel>
        <PoolList entries={snapshot.view} isHost={isHost} onDelete={(id) => void remove(id)} deleting={deleting} />
        {deleteError && <p className="error" role="alert">{deleteError}</p>}
        <AddTaskForm client={client} gameId={gameId} seatNames={others} />
      </section>
      {isHost && <LaunchBar snapshot={snapshot} onLaunch={() => client.launch(gameId)} />}
    </div>
  );
}
