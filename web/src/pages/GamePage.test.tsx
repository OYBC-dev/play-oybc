import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ClientProvider } from '../game/ClientContext';
import { FakeGameClient } from '../game/fakeGameClient';
import { GamePage } from './GamePage';

describe('GamePage', () => {
  it('tells a displaced player they were replaced, with a Home link', async () => {
    const client = new FakeGameClient();
    render(
      <ClientProvider value={client}>
        <MemoryRouter><GamePage gameId="g1" seatId="s1" /></MemoryRouter>
      </ClientProvider>,
    );
    act(() => client.emitError(Object.assign(new Error('denied'), { code: 'permission-denied' })));
    expect(await screen.findByRole('alert')).toHaveTextContent("You've been replaced in this game.");
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  });
});
