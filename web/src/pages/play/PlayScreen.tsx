import { useState } from 'react';
import { RisoButton } from '../../components/riso/RisoButton';
import { errorMessage } from '../../game/errorMessages';
import type { GameClient, GameSnapshot } from '../../game/GameClient';
import { BingoBanner } from './BingoBanner';
import { BoardGrid } from './BoardGrid';
import { Leaderboard } from './Leaderboard';
import { Sheet } from './Sheet';
import { useBingoBanners } from './useBingoBanners';
import styles from './PlayScreen.module.css';

/** The live game: your board, bingo banners, leaderboard sheet, and (host) End game. */
export function PlayScreen({ client, snapshot, gameId }: { client: GameClient; snapshot: GameSnapshot; gameId: string }) {
  const { game, mySeatId, board, bingos } = snapshot;
  const isHost = game.hostSeatId === mySeatId;
  const banner = useBingoBanners(bingos, mySeatId);
  const [sheet, setSheet] = useState<'leaderboard' | 'end' | null>(null);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  const end = async () => {
    setEnding(true);
    setEndError(null);
    try {
      await client.end(gameId);
      setSheet(null);
    } catch (e) {
      setEndError(errorMessage(e));
    } finally {
      setEnding(false);
    }
  };

  return (
    <div className="page" data-testid="stage-playing">
      <BingoBanner bingo={banner.current} onDismiss={banner.dismiss} />
      <div className={styles.header}>
        <RisoButton size="small" onClick={() => setSheet('leaderboard')}>Leaderboard</RisoButton>
        {isHost && <RisoButton size="small" kind="primary" onClick={() => { setEndError(null); setSheet('end'); }}>End game</RisoButton>}
      </div>
      {board ? (
        <BoardGrid board={board} onToggle={(i) => client.toggleMark(gameId, i)} />
      ) : (
        <p className="muted">Loading</p>
      )}
      {sheet === 'leaderboard' && (
        <Sheet title="Leaderboard" onClose={() => setSheet(null)}>
          <Leaderboard bingos={bingos} />
        </Sheet>
      )}
      {sheet === 'end' && (
        <Sheet title="End game" onClose={() => setSheet(null)}>
          <p className={styles.confirmBody}>Everyone will see the final leaderboard.</p>
          {endError && <p className="error" role="alert">{endError}</p>}
          <div className={styles.confirmActions}>
            <RisoButton onClick={() => setSheet(null)}>Cancel</RisoButton>
            <RisoButton kind="primary" disabled={ending} onClick={() => void end()}>End game</RisoButton>
          </div>
        </Sheet>
      )}
    </div>
  );
}
