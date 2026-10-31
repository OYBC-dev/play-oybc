import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { PlayBrandMark } from '../components/riso/PlayBrandMark';
import { RisoButton } from '../components/riso/RisoButton';
import { RisoCard } from '../components/riso/RisoCard';
import { RisoSectionLabel } from '../components/riso/RisoSectionLabel';
import { RisoSwitch } from '../components/riso/RisoSwitch';
import { useClient } from '../game/ClientContext';
import { errorMessage } from '../game/errorMessages';
import { clearHostDraft, hostDraft, MAX_GAME_NAME_LENGTH, tasksPerBoardFor, updateHostDraft } from './hostDraft';
import landing from './Landing.module.css';
import styles from './GameSettings.module.css';

/** Router state Home passes to `/host`. */
export interface HostRouteState {
  name: string;
}

/**
 * `/host`: Game settings, chosen before the game exists (they lock once it is created): the game's name
 * and Free space, with the derived tasks per board. Create game creates it and lands on `/g/{code}`.
 * Reached from Home with the host's name; without one (a direct visit or a reload) it goes back to Home.
 */
export function GameSettingsPage() {
  const client = useClient();
  const navigate = useNavigate();
  const location = useLocation();
  const stateName = (location.state as Partial<HostRouteState> | null)?.name;
  const name = typeof stateName === 'string' && stateName.trim() ? stateName : hostDraft().name;
  const [gameName, setGameName] = useState(() => hostDraft().gameName);
  const [freeSpace, setFreeSpace] = useState(() => hostDraft().freeSpace);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!name.trim()) return <Navigate to="/" replace />;

  const back = () => {
    // Came from Home: pop back to it (the draft keeps the name). Opened directly: replace with Home.
    if (location.key !== 'default') navigate(-1);
    else navigate('/', { replace: true });
  };

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const trimmed = gameName.trim();
      const res = await client.createGame(name, { ...(trimmed && { gameName: trimmed }), freeSpace });
      clearHostDraft();
      navigate(`/g/${res.code}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <main className={`page ${styles.settings}`}>
      <div className={styles.head}>
        <PlayBrandMark size="header" />
        <div className={styles.titles}>
          <RisoSectionLabel variant="kicker">Host</RisoSectionLabel>
          <h1 className={styles.title}>Game settings</h1>
        </div>
        <RisoButton kind="ghost" onClick={back}>Back</RisoButton>
      </div>
      <form className={styles.form} onSubmit={create}>
        <RisoCard padded className={styles.card}>
          <RisoSectionLabel>Game name</RisoSectionLabel>
          <input
            className={landing.input}
            aria-label="Game name"
            aria-describedby="game-name-help"
            value={gameName}
            onChange={(e) => { setGameName(e.target.value); updateHostDraft({ gameName: e.target.value }); }}
            maxLength={MAX_GAME_NAME_LENGTH}
            autoComplete="off"
          />
          <p id="game-name-help" className={styles.help}>Shown in the lobby and on the join page. Optional.</p>
        </RisoCard>
        <RisoCard padded className={styles.card}>
          <RisoSectionLabel>Board</RisoSectionLabel>
          <label className={styles.row}>
            <span className={styles.labelBlock}>
              <span className={styles.label}>Free space</span>
              <span id="free-space-help" className={styles.help}>The centre square starts marked. Boards need 24 tasks instead of 25.</span>
            </span>
            <RisoSwitch
              checked={freeSpace}
              aria-label="Free space"
              aria-describedby="free-space-help"
              onChange={(e) => { setFreeSpace(e.currentTarget.checked); updateHostDraft({ freeSpace: e.currentTarget.checked }); }}
            />
          </label>
          <div className={styles.divider} aria-hidden="true" />
          <div className={styles.row}>
            <span className={styles.label}>Tasks per board</span>
            <span className={styles.value} data-testid="tasks-per-board">{tasksPerBoardFor(freeSpace)}</span>
          </div>
        </RisoCard>
        <div className={styles.footer}>
          <RisoButton type="submit" kind="primary" size="large" fullWidth disabled={busy}>Create game</RisoButton>
          {error && <p className="error" role="alert">{error}</p>}
          <p className={styles.hosting}>Hosting as {name.trim()} · settings lock once the game is created</p>
        </div>
      </form>
    </main>
  );
}
