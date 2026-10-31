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
  standings: [],
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

  it('the final leaderboard lists the standings', () => {
    const standings = [
      { seatId: 's2', name: 'Cody', bingos: 2, marked: 14, bestLine: 5, firstBingoSeq: 1 },
      { seatId: 's1', name: 'Ann', bingos: 0, marked: 6, bestLine: 3, firstBingoSeq: null },
    ];
    render(
      <MemoryRouter>
        <EndedScreen client={new FakeGameClient()} snapshot={{ ...snapshot, standings }} gameId="g1" />
      </MemoryRouter>,
    );
    const rows = screen.getAllByTestId('standing');
    expect(rows.map((r) => r.textContent)).toEqual(['1Cody14 squares2 bingos', '2Ann6 squares · 3 in a row']);
    expect(screen.queryByText('No bingos yet')).toBeNull();
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
