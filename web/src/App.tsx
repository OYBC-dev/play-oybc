import { Route, Routes } from 'react-router-dom';
import { ClientProvider } from './game/ClientContext';
import type { GameClient } from './game/GameClient';
import { createWsGameClient } from './game/wsGameClient';
import { HomePage } from './pages/HomePage';
import { JoinPage } from './pages/JoinPage';

/** The game-server client for `VITE_GAME_SERVER_URL`; a build without it fails at startup, loudly. */
function clientFromEnv(): GameClient {
  const url: unknown = import.meta.env.VITE_GAME_SERVER_URL;
  if (typeof url !== 'string' || !url) {
    const message = 'VITE_GAME_SERVER_URL is not set: point it at the game server (e.g. ws://127.0.0.1:8787 in web/.env.local).';
    console.error(message);
    throw new Error(message);
  }
  return createWsGameClient(url);
}

const client = clientFromEnv();

/** Route table; the real game-server client is provided once at the root. */
export function App() {
  return (
    <ClientProvider value={client}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/g/:code" element={<JoinPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </ClientProvider>
  );
}
