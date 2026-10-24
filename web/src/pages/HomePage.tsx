import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayBrandMark, Wordmark } from '../components/riso/PlayBrandMark';
import { RisoButton } from '../components/riso/RisoButton';
import { RisoCard } from '../components/riso/RisoCard';
import { RisoSectionLabel } from '../components/riso/RisoSectionLabel';
import { useClient } from '../game/ClientContext';
import { errorMessage } from '../game/errorMessages';
import styles from './Landing.module.css';

/** Landing page: host a new game or join one by code. */
export function HomePage() {
  const client = useClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function host(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await client.createGame(name);
      navigate(`/g/${res.code}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
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
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoComplete="nickname"
          />
          {error && <p className="error" role="alert">{error}</p>}
          <RisoButton type="submit" kind="primary" size="large" fullWidth disabled={busy}>Host a game</RisoButton>
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
