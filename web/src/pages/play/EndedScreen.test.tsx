import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FakeGameClient } from '../../game/fakeGameClient';
import type { GameSnapshot } from '../../game/GameClient';
import { EndedScreen } from './EndedScreen';

const snapshot = {
  game: { code: 'HX7KQ', stage: 'ended', hostSeatId: 's2', createdAt: 0, bingoCount: 0, shortfalls: {}, reviewGate: false },
  mySeatId: 's1',
  seats: [],
  view: [],
  board: { cells: [{ kind: 'free' }, { kind: 'task', taskId: 't', text: 'Read a book' }], marks: [true, false], completedLines: [] },
  bingos: [],
  reclaims: [],
} as unknown as GameSnapshot;

describe('EndedScreen', () => {
  it('shows kicker, title, board section and New game goes home', async () => {
    render(
      <MemoryRouter initialEntries={['/g/x']}>
        <Routes>
          <Route path="/g/x" element={<EndedScreen client={new FakeGameClient()} snapshot={snapshot} gameId="g1" />} />
          <Route path="/" element={<p>home</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Ended · HX7KQ')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Final leaderboard' })).toBeInTheDocument();
    expect(screen.getByText('Your board')).toBeInTheDocument();
    expect(screen.getByText('No bingos yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'New game' }));
    expect(screen.getByText('home')).toBeInTheDocument();
  });

  it('a game ended from the lobby (no board, no bingos) shows the empty leaderboard and no board section', () => {
    render(
      <MemoryRouter>
        <EndedScreen client={new FakeGameClient()} snapshot={{ ...snapshot, board: null }} gameId="g1" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Final leaderboard' })).toBeInTheDocument();
    expect(screen.getByText('No bingos yet')).toBeInTheDocument();
    expect(screen.queryByText('Your board')).toBeNull();
    expect(screen.getByRole('button', { name: 'New game' })).toBeInTheDocument();
  });
});
