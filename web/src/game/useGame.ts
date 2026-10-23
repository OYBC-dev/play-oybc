import { useEffect, useState } from 'react';
import type { GameClient, GameSnapshot } from './GameClient';

/** Subscribes to one game for one seat; returns the latest merged snapshot or the listener error. */
export function useGame(client: GameClient, gameId: string, seatId: string): { snapshot: GameSnapshot | null; error: Error | null } {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    setSnapshot(null);
    setError(null);
    return client.subscribe(gameId, seatId, setSnapshot, setError);
  }, [client, gameId, seatId]);
  return { snapshot, error };
}
