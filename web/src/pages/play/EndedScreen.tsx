import { useNavigate } from 'react-router-dom';
import { RisoButton } from '../../components/riso/RisoButton';
import { RisoCard } from '../../components/riso/RisoCard';
import { RisoSectionLabel } from '../../components/riso/RisoSectionLabel';
import { tasksPerBoardOf, type GameClient, type GameSnapshot } from '../../game/GameClient';
import { ReclaimPrompt } from '../host/ReclaimPrompt';
import { BoardGrid } from './BoardGrid';
import { Leaderboard } from './Leaderboard';
import styles from './EndedScreen.module.css';

const noToggle = async () => ({ marks: [], completedLines: [], newBingoSeqs: [] });

/** After the host ends the game: the final leaderboard and your final board. */
export function EndedScreen({ client, snapshot, gameId }: { client: GameClient; snapshot: GameSnapshot; gameId: string }) {
  const navigate = useNavigate();
  return (
    <div className="page" data-testid="stage-ended">
      {snapshot.game.hostSeatId === snapshot.mySeatId && <ReclaimPrompt client={client} gameId={gameId} reclaims={snapshot.reclaims} />}
      <header className={styles.head}>
        <RisoSectionLabel variant="kicker">Ended · {snapshot.game.code}</RisoSectionLabel>
        <h1 className={styles.title}>Final leaderboard</h1>
      </header>
      <RisoCard padded>
        <Leaderboard standings={snapshot.standings} tasksPerBoard={tasksPerBoardOf(snapshot.game)} />
      </RisoCard>
      {snapshot.board && (
        <section className={styles.board}>
          <RisoSectionLabel>Your board</RisoSectionLabel>
          <BoardGrid board={snapshot.board} readOnly onToggle={noToggle} />
        </section>
      )}
      <RisoButton kind="dark" fullWidth onClick={() => navigate('/')}>New game</RisoButton>
    </div>
  );
}
