import type { GameSnapshot } from '../../game/GameClient';

/** Placeholder until Task 12. */
export function EndedView({ snapshot }: { snapshot: GameSnapshot }) {
  return <div data-testid="stage-ended">{snapshot.game.code}</div>;
}
