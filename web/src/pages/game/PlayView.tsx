import type { GameSnapshot } from '../../game/GameClient';

/** Placeholder until Task 12. */
export function PlayView({ snapshot }: { snapshot: GameSnapshot }) {
  return <div data-testid="stage-playing">{snapshot.game.code}</div>;
}
