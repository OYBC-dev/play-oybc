import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
  standings: [],
  reclaims: [],
  roster: [],
};
const denied = () => Object.assign(new Error('denied'), { code: 'permission-denied' });

function setup(client: FakeGameClient) {
  render(
    <ClientProvider value={client}>
      <MemoryRouter><GamePage gameId="g1" seatId="s1" /></MemoryRouter>
    </ClientProvider>,
  );
}

/** Renders the page at /g/ABCDE as `seatId` with a Home route, emits `snap`, and taps Menu → Leave game. */
async function leaveVia(client: FakeGameClient, seatId: string, snap: GameSnapshot, stage: string) {
  render(
    <ClientProvider value={client}>
      <MemoryRouter initialEntries={['/g/ABCDE']}>
        <Routes>
          <Route path="/" element={<p>home page</p>} />
          <Route path="/g/:code" element={<GamePage gameId="g1" seatId={seatId} />} />
        </Routes>
      </MemoryRouter>
    </ClientProvider>,
  );
  act(() => client.emit(snap));
  expect(await screen.findByTestId(stage)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Leave game' }));
  expect(await screen.findByText('home page')).toBeInTheDocument();
  expect(screen.queryByTestId(stage)).toBeNull();
}

describe('GamePage', () => {
  it('the host leaving the lobby keeps the seat: releases the game on the client and goes Home', async () => {
    const client = new FakeGameClient();
    await leaveVia(client, 's1', snapshot, 'stage-lobby');
    expect(client.calls).toContainEqual(['leave', 'g1']);
    expect(client.calls.some((c) => c[0] === 'leaveGame')).toBe(false);
  });

  it('a guest leaving the lobby gives the seat up on the server first, then goes Home', async () => {
    const client = new FakeGameClient();
    const guest: GameSnapshot = { ...snapshot, mySeatId: 's2', seats: [...snapshot.seats, { seatId: 's2', name: 'Sam', nameKey: 'sam', joinedAt: 1 }] };
    await leaveVia(client, 's2', guest, 'stage-lobby');
    const names = client.calls.map((c) => c[0]);
    expect(names.indexOf('leaveGame')).toBeGreaterThanOrEqual(0);
    expect(names.indexOf('leaveGame')).toBeLessThan(names.indexOf('leave'));
    expect(client.calls).toContainEqual(['leaveGame', 'g1']);
  });

  it('a guest leaving a game in play keeps the seat', async () => {
    const client = new FakeGameClient();
    const playing: GameSnapshot = {
      ...snapshot, mySeatId: 's2', game: { ...snapshot.game, stage: 'playing' },
      seats: [...snapshot.seats, { seatId: 's2', name: 'Sam', nameKey: 'sam', joinedAt: 1 }],
      board: { seatId: 's2', cells: [], marks: [], completedLines: [], announcedLines: [] } as never,
    };
    await leaveVia(client, 's2', playing, 'stage-playing');
    expect(client.calls).toContainEqual(['leave', 'g1']);
    expect(client.calls.some((c) => c[0] === 'leaveGame')).toBe(false);
  });

  it('tells a previously seated player they were replaced, with a Home link', async () => {
    const client = new FakeGameClient();
    setup(client);
    act(() => client.emit(snapshot));
    expect(await screen.findByTestId('stage-lobby')).toBeInTheDocument();
    act(() => client.emitError(denied()));
    expect(await screen.findByRole('alert')).toHaveTextContent("You've been replaced in this game.");
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  });

  it('a transient listener error offers Try again, which re-subscribes', async () => {
    const client = new FakeGameClient();
    setup(client);
    act(() => client.emitError(new Error('unavailable')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    client.snapshot = snapshot;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('stage-lobby')).toBeInTheDocument();
    expect(client.calls.filter((c) => c[0] === 'subscribe')).toHaveLength(2);
  });

  it('replaced and not-in-game are terminal (no Try again)', async () => {
    const client = new FakeGameClient();
    setup(client);
    act(() => client.emitError(denied()));
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('says not in this game when access was never granted', async () => {
    const client = new FakeGameClient();
    setup(client);
    act(() => client.emitError(denied()));
    expect(await screen.findByRole('alert')).toHaveTextContent("You're not in this game.");
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  });
});
