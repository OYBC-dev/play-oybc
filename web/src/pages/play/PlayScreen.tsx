import { useState } from 'react';
import { RisoButton } from '../../components/riso/RisoButton';
import type { GameClient, GameSnapshot } from '../../game/GameClient';
import { HostMenu } from '../host/HostMenu';
import { ReclaimPrompt } from '../host/ReclaimPrompt';
import { BingoBanner } from './BingoBanner';
import { BoardGrid } from './BoardGrid';
import { Leaderboard } from './Leaderboard';
import { Sheet } from './Sheet';
import { useBingoBanners } from './useBingoBanners';
import styles from './PlayScreen.module.css';

/** The live game: code pill + Leaderboard + game menu header, your board, bingo banners. */
export function PlayScreen({ client, snapshot, gameId, onLeave }: {
  client: GameClient; snapshot: GameSnapshot; gameId: string; onLeave: () => void;
}) {
  const { game, mySeatId, board, bingos } = snapshot;
  const isHost = game.hostSeatId === mySeatId;
  const banner = useBingoBanners(bingos, mySeatId);
  const [leaderboard, setLeaderboard] = useState(false);

  return (
    <div className={`page ${styles.play}`} data-testid="stage-playing" data-focus-fallback tabIndex={-1}>
      <BingoBanner queue={banner.queue} onDismiss={banner.dismiss} />
      {isHost && <ReclaimPrompt client={client} gameId={gameId} reclaims={snapshot.reclaims} seats={snapshot.seats} />}
      <header className={styles.header}>
        <span className={styles.code} data-testid="game-code">{game.code}</span>
        {game.gameName && <span className={styles.gameName} data-testid="game-name">{game.gameName}</span>}
        <div className={styles.actions}>
          <RisoButton size="small" onClick={() => setLeaderboard(true)}>Leaderboard</RisoButton>
          <HostMenu client={client} gameId={gameId} snapshot={snapshot} canEnd onLeave={onLeave} />
        </div>
      </header>
      {board ? (
        <BoardGrid board={board} onToggle={(i, marked) => client.toggleMark(gameId, i, marked)} />
      ) : (
        <p className="muted">Loading</p>
      )}
      {leaderboard && (
        <Sheet title="Leaderboard" onClose={() => setLeaderboard(false)}>
          <Leaderboard standings={snapshot.standings} />
        </Sheet>
      )}
    </div>
  );
}
