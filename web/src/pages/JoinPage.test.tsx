import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { GameSnapshot } from '../game/GameClient';
import { ClientProvider } from '../game/ClientContext';
import { appError, FakeGameClient } from '../game/fakeGameClient';
import { JoinPage } from './JoinPage';

const snapshot: GameSnapshot = {
  game: { code: 'ABCDE', stage: 'lobby', hostSeatId: 's1', createdAt: 0, bingoCount: 0, shortfalls: {}, reviewGate: false },
  mySeatId: 's2',
  seats: [{ seatId: 's2', name: 'Pat', nameKey: 'pat', joinedAt: 0 }],
  view: [],
  board: null,
  bingos: [],
  standings: [],
  reclaims: [],
};

function setup(client: FakeGameClient) {
  client.snapshot = snapshot;
  render(
    <ClientProvider value={client}>
      <MemoryRouter initialEntries={['/g/abcde']}>
        <Routes>
          <Route path="/g/:code" element={<JoinPage />} />
        </Routes>
      </MemoryRouter>
    </ClientProvider>,
  );
}

const nameField = () => screen.findByLabelText('Your name');
const submit = () => userEvent.click(screen.getByRole('button', { name: 'Join' }));

describe('JoinPage', () => {
  it('a failed whoAmI offers Try again, which checks again', async () => {
    const client = new FakeGameClient();
    client.whoAmIResult = appError('internal');
    setup(client);
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    client.whoAmIResult = { gameId: 'g1', seatId: 's2' };
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('stage-lobby')).toBeInTheDocument();
    expect(client.calls.filter((c) => c[0] === 'whoAmI')).toHaveLength(2);
  });

  it('renders the game without asking for a name when already seated', async () => {
    const client = new FakeGameClient();
    client.whoAmIResult = { gameId: 'g1', seatId: 's2' };
    setup(client);
    expect(await screen.findByTestId('stage-lobby')).toBeInTheDocument();
    expect(screen.queryByLabelText('Your name')).toBeNull();
    expect(client.calls[0]).toEqual(['whoAmI', 'ABCDE']);
  });

  it('asks for a name, joins, and renders the game', async () => {
    const client = new FakeGameClient();
    setup(client);
    await userEvent.type(await nameField(), 'Pat');
    await submit();
    expect(await screen.findByTestId('stage-lobby')).toBeInTheDocument();
    expect(client.calls).toContainEqual(['joinGame', 'ABCDE', 'Pat']);
  });

  it('shows the kicker and code in the header', async () => {
    setup(new FakeGameClient());
    await nameField();
    expect(screen.getByText('Join', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('ABCDE')).toBeInTheDocument();
    expect(screen.getByText('Your name', { selector: 'p' })).toBeInTheDocument();
  });

  it('waits for the host on reclaim-pending, then renders the game when approved', async () => {
    const client = new FakeGameClient();
    client.joinResult = { status: 'reclaim-pending', gameId: 'g1', reclaimId: 'r1' };
    setup(client);
    await userEvent.type(await nameField(), 'Pat');
    await submit();
    expect(await screen.findByText('Waiting for the host')).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Your name')).toHaveValue('Pat');
    expect(screen.queryByRole('button', { name: 'Join' })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for the host');
    await userEvent.type(screen.getByLabelText('Your name'), '{Enter}');
    expect(client.calls.filter((c) => c[0] === 'joinGame')).toHaveLength(1);
    expect(client.calls).toContainEqual(['watchReclaim', 'g1', 'r1']);
    client.whoAmIResult = { gameId: 'g1', seatId: 's2' };
    await act(async () => client.emitReclaim('approved'));
    expect(await screen.findByTestId('stage-lobby')).toBeInTheDocument();
  });

  it('returns to the name field with an error when the host says no', async () => {
    const client = new FakeGameClient();
    client.joinResult = { status: 'reclaim-pending', gameId: 'g1', reclaimId: 'r1' };
    setup(client);
    await userEvent.type(await nameField(), 'Pat');
    await submit();
    await screen.findByText('Waiting for the host');
    await act(async () => client.emitReclaim('denied'));
    expect(await screen.findByLabelText('Your name')).not.toHaveAttribute('readonly');
    expect(screen.getByRole('alert')).toHaveTextContent('The host said no');
    expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument();
  });

  it.each([
    ['invalid-name', 'letters'],
    ['game-not-found', 'No game'],
    ['game-ended', 'ended'],
  ])('shows an inline error for %s', async (code, text) => {
    const client = new FakeGameClient();
    client.joinResult = appError(code);
    setup(client);
    await userEvent.type(await nameField(), 'Pat');
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
  });
});

describe('JoinPage failures', () => {
  async function toWaiting(client: FakeGameClient) {
    client.joinResult = { status: 'reclaim-pending', gameId: 'g1', reclaimId: 'r1' };
    setup(client);
    await userEvent.type(await nameField(), 'Pat');
    await submit();
    await screen.findByText('Waiting for the host');
  }

  it('returns to the name form with an error when watching the reclaim fails', async () => {
    const client = new FakeGameClient();
    await toWaiting(client);
    await act(async () => client.emitReclaimError(new Error('boom')));
    expect(await screen.findByLabelText('Your name')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('shows an error when approved but no seat resolves', async () => {
    const client = new FakeGameClient();
    await toWaiting(client);
    await act(async () => client.emitReclaim('approved'));
    expect(await screen.findByLabelText('Your name')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('surfaces a missing game with a link home', async () => {
    const client = new FakeGameClient();
    client.whoAmIResult = { gameId: 'g1', seatId: 's2' };
    render(
      <ClientProvider value={client}>
        <MemoryRouter initialEntries={['/g/abcde']}>
          <Routes><Route path="/g/:code" element={<JoinPage />} /></Routes>
        </MemoryRouter>
      </ClientProvider>,
    );
    await waitFor(() => expect(client.calls).toContainEqual(['subscribe', 'g1', 's2']));
    await act(async () => client.emitError(appError('game-not-found')));
    expect(await screen.findByRole('alert')).toHaveTextContent('No game');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
  });
});
