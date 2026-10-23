import { createContext, useContext } from 'react';
import type { GameClient } from './GameClient';

const ClientContext = createContext<GameClient | null>(null);

export const ClientProvider = ClientContext.Provider;

/** The GameClient provided by the app root (real) or a test (fake). */
export function useClient(): GameClient {
  const c = useContext(ClientContext);
  if (!c) throw new Error('GameClient not provided');
  return c;
}
