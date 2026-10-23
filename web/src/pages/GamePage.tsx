import { useClient } from '../game/ClientContext';
import { errorMessage } from '../game/errorMessages';
import { useGame } from '../game/useGame';
import { EndedView } from './game/EndedView';
import { LobbyView } from './game/LobbyView';
import { PlayView } from './game/PlayView';

/** Renders the live game for a seated player, switching on stage. */
export function GamePage({ gameId, seatId }: { gameId: string; seatId: string }) {
  const client = useClient();
  const { snapshot, error } = useGame(client, gameId, seatId);
  if (error) return <div className="page"><p className="error" role="alert">{errorMessage(error)}</p></div>;
  if (!snapshot) return <div className="page"><p className="muted">Loading</p></div>;
  switch (snapshot.game.stage) {
    case 'lobby': return <LobbyView snapshot={snapshot} />;
    case 'playing': return <PlayView snapshot={snapshot} />;
    case 'ended': return <EndedView snapshot={snapshot} />;
  }
}
