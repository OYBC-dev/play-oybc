import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ClientProvider } from '../game/ClientContext';
import { FakeGameClient } from '../game/fakeGameClient';
import type { GameSnapshot } from '../game/GameClient';
import { GamePage } from './GamePage';

const snapshot: GameSnapshot = {
  game: { code: 'ABCDE', stage: 'lobby', hostSeatId: 's1', createdAt: 0, bingoCount: 0, shortfalls: {}, reviewGate: false },
  mySeatId: 's1',
  seats: [{ seatId: 's1', name: 'Pat', nameKey: 'pat', joinedAt: 0 }],
  view: [],
  board: null,
  bingos: [],
  reclaims: [],
};
const denied = () => Object.assign(new Error('denied'), { code: 'permission-denied' });

function setup(client: FakeGameClient) {
  render(
    <ClientProvider value={client}>
      <MemoryRouter><GamePage gameId="g1" seatId="s1" /></MemoryRouter>
    </ClientProvider>,
  );
}

describe('GamePage', () => {
  it('tells a previously seated player they were replaced, with a Home link', async () => {
    const client = new FakeGameClient();
    setup(client);
    act(() => client.emit(snapshot));
    expect(await screen.findByTestId('stage-lobby')).toBeInTheDocument();
    act(() => client.emitError(denied()));
    expect(await screen.findByRole('alert')).toHaveTextContent("You've been replaced in this game.");
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  });

  it('says not in this game when access was never granted', async () => {
    const client = new FakeGameClient();
    setup(client);
    act(() => client.emitError(denied()));
    expect(await screen.findByRole('alert')).toHaveTextContent("You're not in this game.");
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  });
});
