import { Link } from 'react-router-dom';
import { useClient } from '../game/ClientContext';
import { errorMessage } from '../game/errorMessages';
import { useGame } from '../game/useGame';
import { EndedScreen } from './play/EndedScreen';
import { LobbyScreen } from './lobby/LobbyScreen';
import { PlayScreen } from './play/PlayScreen';

/** Renders the live game for a seated player, switching on stage. */
export function GamePage({ gameId, seatId }: { gameId: string; seatId: string }) {
  const client = useClient();
  const { snapshot, error } = useGame(client, gameId, seatId);
  if (error) return <div className="page"><p className="error" role="alert">{errorMessage(error)}</p><Link to="/">Home</Link></div>;
  if (!snapshot) return <div className="page"><p className="muted">Loading</p></div>;
  switch (snapshot.game.stage) {
    case 'lobby': return <LobbyScreen client={client} snapshot={snapshot} gameId={gameId} />;
    case 'playing': return <PlayScreen client={client} snapshot={snapshot} gameId={gameId} />;
    case 'ended': return <EndedScreen client={client} snapshot={snapshot} gameId={gameId} />;
  }
}
