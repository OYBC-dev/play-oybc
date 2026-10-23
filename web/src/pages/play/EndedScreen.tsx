import { RisoSectionLabel } from '../../components/riso/RisoSectionLabel';
import type { GameSnapshot } from '../../game/GameClient';
import { BoardGrid } from './BoardGrid';
import { Leaderboard } from './Leaderboard';

/** After the host ends the game: the leaderboard and your final board. */
export function EndedScreen({ snapshot }: { snapshot: GameSnapshot }) {
  return (
    <div className="page" data-testid="stage-ended">
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
