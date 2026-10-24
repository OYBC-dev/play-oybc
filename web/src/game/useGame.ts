import { useCallback, useEffect, useState } from 'react';
import type { GameClient, GameSnapshot } from './GameClient';

/**
 * Subscribes to one game for one seat; returns the latest merged snapshot or the listener error,
 * and `retry`, which drops the error and subscribes again.
 */
export function useGame(
  client: GameClient, gameId: string, seatId: string,
): { snapshot: GameSnapshot | null; error: Error | null; retry: () => void } {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setSnapshot(null);
    setError(null);
    return client.subscribe(gameId, seatId, setSnapshot, setError);
  }, [client, gameId, seatId, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { snapshot, error, retry };
}
