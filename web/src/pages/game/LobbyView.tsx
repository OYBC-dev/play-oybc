import type { GameSnapshot } from '../../game/GameClient';

/** Placeholder until Task 11. */
export function LobbyView({ snapshot }: { snapshot: GameSnapshot }) {
  return <div data-testid="stage-lobby">{snapshot.game.code}</div>;
}
