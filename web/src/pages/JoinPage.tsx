import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RisoButton } from '../components/riso/RisoButton';
import { RisoCard } from '../components/riso/RisoCard';
import { RisoSectionLabel } from '../components/riso/RisoSectionLabel';
import { useClient } from '../game/ClientContext';
import { errorMessage } from '../game/errorMessages';
import { GamePage } from './GamePage';

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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setPhase({ kind: 'checking' });
    client.whoAmI(code).then(
      (me) => { if (live) setPhase(me ? { kind: 'seated', ...me } : { kind: 'name' }); },
      (e) => { if (live) setPhase({ kind: 'failed', message: errorMessage(e) }); },
    );
    return () => { live = false; };
  }, [client, code]);

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
        setError('The host said no');
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

  switch (phase.kind) {
    case 'seated':
      return <GamePage key={`${phase.gameId}:${phase.seatId}`} gameId={phase.gameId} seatId={phase.seatId} />;
    case 'checking':
      return <main className="page"><p className="muted">Loading</p></main>;
    case 'waiting':
      return <main className="page"><RisoCard><p>Waiting for the host</p></RisoCard></main>;
    case 'failed':
      return (
        <main className="page">
          <p className="error" role="alert">{phase.message}</p>
          <Link to="/">Home</Link>
        </main>
      );
    case 'name':
      return (
        <main className="page">
          <RisoCard>
            <form className="stack" onSubmit={submit}>
              <RisoSectionLabel>{code}</RisoSectionLabel>
              <label className="field">Your name
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoComplete="nickname" />
              </label>
              {error && <p className="error" role="alert">{error}</p>}
              <RisoButton type="submit" kind="primary" size="large" fullWidth disabled={busy}>Join</RisoButton>
            </form>
          </RisoCard>
        </main>
      );
  }
}
