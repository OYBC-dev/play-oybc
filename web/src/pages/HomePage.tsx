import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayBrandMark, Wordmark } from '../components/riso/PlayBrandMark';
import { RisoButton } from '../components/riso/RisoButton';
import { RisoCard } from '../components/riso/RisoCard';
import { RisoSectionLabel } from '../components/riso/RisoSectionLabel';
import { errorMessage } from '../game/errorMessages';
import type { HostRouteState } from './GameSettingsPage';
import { hostDraft, isValidHostName, updateHostDraft } from './hostDraft';
import styles from './Landing.module.css';

/** The error a callable would carry for a name the server refuses (same copy as a server-side refusal). */
const INVALID_NAME = { details: { code: 'invalid-name' } };

/**
 * Landing page: host a new game or join one by code. Host a game checks the name and opens Game settings
 * (`/host`), where the game is created; the name is kept in the host draft so Back returns to it.
 */
export function HomePage() {
  const navigate = useNavigate();
  const [name, setName] = useState(() => hostDraft().name);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  function host(e: FormEvent) {
    e.preventDefault();
    if (!isValidHostName(name)) {
      setError(errorMessage(INVALID_NAME));
      return;
    }
    setError(null);
    updateHostDraft({ name });
    const state: HostRouteState = { name };
    navigate('/host', { state });
  }

  function join(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) navigate(`/g/${c}`);
  }

  return (
    <main className={`page ${styles.home}`}>
      <div className={styles.hero}>
        <PlayBrandMark size="home" />
        <Wordmark />
      </div>
      <RisoCard padded>
        <form className={styles.form} onSubmit={host}>
          <RisoSectionLabel>Host a game</RisoSectionLabel>
          <input
            className={styles.input}
            aria-label="Your name"
            placeholder="Your name"
            value={name}
            onChange={(e) => { setName(e.target.value); updateHostDraft({ name: e.target.value }); }}
            maxLength={20}
            autoComplete="nickname"
          />
          {error && <p className="error" role="alert">{error}</p>}
          <RisoButton type="submit" kind="primary" size="large" fullWidth>Host a game</RisoButton>
        </form>
      </RisoCard>
      <RisoCard padded>
        <form className={styles.form} onSubmit={join}>
          <RisoSectionLabel>Join</RisoSectionLabel>
          <input
            className={`${styles.input} ${styles.code}`}
            aria-label="Game code"
            placeholder="Game code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={5}
            autoCapitalize="characters"
            autoComplete="off"
          />
          <RisoButton type="submit" kind="blue" size="large" fullWidth disabled={!code.trim()}>Join</RisoButton>
        </form>
      </RisoCard>
    </main>
  );
}
