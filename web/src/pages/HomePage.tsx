import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { RisoBrandMark } from '../components/riso/RisoBrandMark';
import { RisoButton } from '../components/riso/RisoButton';
import { RisoCard } from '../components/riso/RisoCard';
import { RisoSectionLabel } from '../components/riso/RisoSectionLabel';
import { useClient } from '../game/ClientContext';
import { errorMessage } from '../game/errorMessages';

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
    <main className="page">
      <div className="brand"><RisoBrandMark size={40} /> Play OYBC</div>
      <RisoCard>
        <form className="stack" onSubmit={host}>
          <RisoSectionLabel>Host</RisoSectionLabel>
          <label className="field">Your name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoComplete="nickname" />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <RisoButton type="submit" kind="primary" size="large" fullWidth disabled={busy}>Host a game</RisoButton>
        </form>
      </RisoCard>
      <RisoCard>
        <form className="stack" onSubmit={join}>
          <RisoSectionLabel>Join</RisoSectionLabel>
          <label className="field">Game code
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={5} autoCapitalize="characters" autoComplete="off" />
          </label>
          <RisoButton type="submit" kind="blue" size="large" fullWidth disabled={!code.trim()}>Join</RisoButton>
        </form>
      </RisoCard>
    </main>
  );
}
