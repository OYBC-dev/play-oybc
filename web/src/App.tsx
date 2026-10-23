import { Route, Routes } from 'react-router-dom';
import { ClientProvider } from './game/ClientContext';
import { firebaseGameClient } from './game/firebaseGameClient';
import { HomePage } from './pages/HomePage';
import { JoinPage } from './pages/JoinPage';

/** Route table; the real Firebase-backed client is provided once at the root. */
export function App() {
  return (
    <ClientProvider value={firebaseGameClient}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/g/:code" element={<JoinPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </ClientProvider>
  );
}
