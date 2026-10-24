import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PlayBrandMark } from '../components/riso/PlayBrandMark';
import { RisoButton } from '../components/riso/RisoButton';
import { RisoCard } from '../components/riso/RisoCard';
import { RisoSectionLabel } from '../components/riso/RisoSectionLabel';
import { useClient } from '../game/ClientContext';
import { errorMessage } from '../game/errorMessages';
import { GamePage } from './GamePage';
import styles from './Landing.module.css';

type Phase =
  | { kind: 'checking' }
  | { kind: 'name' }
  | { kind: 'waiting'; gameId: string; reclaimId: string }
  | { kind: 'seated'; gameId: string; seatId: string }
  | { kind: 'failed'; message: string };

/** `/g/:code`: resume an existing seat, or ask for a name and join (with host-approved seat reclaim). */
export function JoinPage() {
  const client = useClient();
  const code = (useParams().code ?? '').toUpperCase();
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setPhase({ kind: 'checking' });
    client.whoAmI(code).then(
      (me) => { if (live) setPhase(me ? { kind: 'seated', ...me } : { kind: 'name' }); },
      (e) => { if (live) setPhase({ kind: 'failed', message: errorMessage(e) }); },
    );
    return () => { live = false; };
  }, [client, code, attempt]);

  const waitingFor = phase.kind === 'waiting' ? phase : null;
  useEffect(() => {
    if (!waitingFor) return;
    let live = true;
    const backToName = (e: unknown) => {
      if (!live) return;
      setError(errorMessage(e));
      setPhase({ kind: 'name' });
    };
    const stop = client.watchReclaim(waitingFor.gameId, waitingFor.reclaimId, (status) => {
      if (!live || status === 'pending') return;
      if (status === 'denied') {
        setError(null);
        setDenied(true);
        setPhase({ kind: 'name' });
        return;
      }
      client.whoAmI(code).then(
        (me) => { if (me) { if (live) setPhase({ kind: 'seated', ...me }); } else backToName(null); },
        backToName,
      );
    }, backToName);
    return () => { live = false; stop(); };
  }, [client, code, waitingFor?.gameId, waitingFor?.reclaimId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDenied(false);
    try {
      const res = await client.joinGame(code, name);
      if (res.status === 'reclaim-pending') setPhase({ kind: 'waiting', gameId: res.gameId, reclaimId: res.reclaimId });
      else setPhase({ kind: 'seated', gameId: res.gameId, seatId: res.seatId });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const nameForm = (waiting: boolean) => (
    <form className={styles.form} onSubmit={submit}>
      <RisoSectionLabel>Your name</RisoSectionLabel>
      <input
        className={styles.input}
        aria-label="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={20}
        autoComplete="nickname"
        readOnly={waiting}
      />
      {error && <p className="error" role="alert">{error}</p>}
      {denied && !waiting && <p className={styles.denied} role="alert"><span className={styles.dot} />The host said no</p>}
      {waiting ? (
        <div className={styles.waiting}>
          Waiting for the host
          <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>
        </div>
      ) : (
        <RisoButton type="submit" kind="blue" size="large" fullWidth disabled={busy}>Join</RisoButton>
      )}
    </form>
  );

  switch (phase.kind) {
    case 'seated':
      return <GamePage key={`${phase.gameId}:${phase.seatId}`} gameId={phase.gameId} seatId={phase.seatId} />;
    case 'checking':
      return <main className="page"><p className="muted">Loading</p></main>;
    case 'waiting':
      return <JoinShell code={code}>{nameForm(true)}</JoinShell>;
    case 'failed':
      return (
        <main className="page">
          <p className="error" role="alert">{phase.message}</p>
          <RisoButton kind="primary" onClick={() => setAttempt((n) => n + 1)}>Try again</RisoButton>
          <Link to="/">Home</Link>
        </main>
      );
    case 'name':
      return <JoinShell code={code}>{nameForm(false)}</JoinShell>;
  }
}

/** Page chrome for the join flow: header (mark, kicker, code) over the name card. */
function JoinShell({ code, children }: { code: string; children: React.ReactNode }): React.ReactElement {
  return (
    <main className={`page ${styles.join}`}>
      <div className={styles.joinHead}>
        <PlayBrandMark size="header" />
        <div>
          <RisoSectionLabel variant="kicker">Join</RisoSectionLabel>
          <div className={styles.joinCode}>{code}</div>
        </div>
      </div>
      <RisoCard padded>{children}</RisoCard>
    </main>
  );
}
