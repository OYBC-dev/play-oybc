import { RisoSectionLabel } from '../../components/riso/RisoSectionLabel';
import type { GameClient, GameSnapshot } from '../../game/GameClient';
import { ReclaimPrompt } from '../host/ReclaimPrompt';
import { BoardGrid } from './BoardGrid';
import { Leaderboard } from './Leaderboard';

/** After the host ends the game: the leaderboard and your final board. */
export function EndedScreen({ client, snapshot, gameId }: { client: GameClient; snapshot: GameSnapshot; gameId: string }) {
  return (
    <div className="page" data-testid="stage-ended">
      {snapshot.game.hostSeatId === snapshot.mySeatId && <ReclaimPrompt client={client} gameId={gameId} reclaims={snapshot.reclaims} />}
      <RisoSectionLabel>Leaderboard</RisoSectionLabel>
      <Leaderboard bingos={snapshot.bingos} />
      {snapshot.board && (
        <>
          <RisoSectionLabel>Your board</RisoSectionLabel>
          <BoardGrid board={snapshot.board} readOnly onToggle={async () => ({ marks: [], completedLines: [], newBingoSeqs: [] })} />
        </>
      )}
    </div>
  );
}
