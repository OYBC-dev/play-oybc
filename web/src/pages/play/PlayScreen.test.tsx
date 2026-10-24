import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { BingoDoc } from 'game-core';
import type { GameSnapshot } from '../../game/GameClient';
import { FakeGameClient } from '../../game/fakeGameClient';
import { EndedScreen } from './EndedScreen';
import { PlayScreen } from './PlayScreen';

function snap(over: { host?: boolean; stage?: 'playing' | 'ended'; bingos?: BingoDoc[] } = {}): GameSnapshot {
  const cells = Array.from({ length: 25 }, (_, i) =>
    i === 12 ? ({ kind: 'free' } as const) : ({ kind: 'task', taskId: `t${i}`, text: `Task ${i}` } as const),
  );
  return {
    game: { code: 'ABCDE', stage: over.stage ?? 'playing', hostSeatId: over.host === false ? 's2' : 's1', createdAt: 0, bingoCount: 0, shortfalls: {}, reviewGate: false },
    mySeatId: 's1',
    seats: [{ seatId: 's1', name: 'Me', nameKey: 'me', joinedAt: 1 }, { seatId: 's2', name: 'Cody', nameKey: 'cody', joinedAt: 2 }],
    view: [],
    board: { cells, marks: cells.map((_, i) => i === 12), completedLines: [], announcedLines: [] },
    bingos: over.bingos ?? [],
    reclaims: [],
  };
}
const bingo = (seq: number, name: string): BingoDoc => ({ seq, seatId: 's2', name, line: 'row_0', playerBingoNumber: seq, at: Date.now(), status: 'announced' });

describe('PlayScreen', () => {
  it('tapping a cell calls toggleMark with its index', async () => {
    const client = new FakeGameClient();
    render(<PlayScreen client={client} snapshot={snap()} gameId="g1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Task 3' }));
    expect(client.calls).toContainEqual(['toggleMark', 'g1', 3, true]);
  });

  it('shows a banner for a new bingo from another player, tap dismisses', async () => {
    const client = new FakeGameClient();
    const { rerender } = render(<PlayScreen client={client} snapshot={snap()} gameId="g1" />);
    rerender(<PlayScreen client={client} snapshot={snap({ bingos: [bingo(1, 'Cody')] })} gameId="g1" />);
    const banner = await screen.findByRole('button', { name: 'Cody got a bingo!' });
    expect(screen.getByTestId('bingo-announce')).toHaveTextContent('Cody got a bingo!');
    await userEvent.click(banner);
    await waitFor(() => expect(screen.queryByTestId('bingo-banner')).not.toBeInTheDocument());
  });

  it('opens the leaderboard as a dialog; Escape closes', async () => {
    const client = new FakeGameClient();
    render(<PlayScreen client={client} snapshot={snap({ bingos: [bingo(1, 'Cody')] })} gameId="g1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Leaderboard' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Cody')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('header: code pill + Leaderboard for everyone, dots menu for the host only', () => {
    const client = new FakeGameClient();
    const { unmount } = render(<PlayScreen client={client} snapshot={snap()} gameId="g1" />);
    const header = screen.getByRole('banner');
    expect(within(header).getByText('ABCDE')).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Leaderboard' })).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Menu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'End game' })).not.toBeInTheDocument();
    unmount();
    render(<PlayScreen client={client} snapshot={snap({ host: false })} gameId="g1" />);
    expect(within(screen.getByRole('banner')).getByText('ABCDE')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument();
  });

  it('host ends the game from the menu: End the game? dialog, confirm calls end', async () => {
    const client = new FakeGameClient();
    render(<PlayScreen client={client} snapshot={snap()} gameId="g1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'End game' }));
    const dialog = screen.getByRole('dialog', { name: 'End the game?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'End game' }));
    expect(client.calls).toContainEqual(['end', 'g1']);
  });
});

describe('EndedScreen', () => {
  it('shows the leaderboard and a read-only final board', () => {
    render(<MemoryRouter><EndedScreen client={new FakeGameClient()} gameId="g1" snapshot={snap({ stage: 'ended', bingos: [bingo(1, 'Cody')] })} /></MemoryRouter>);
    expect(screen.getByText('Cody')).toBeInTheDocument();
    const cells = screen.getAllByRole('button', { name: /Task|Free/ });
    expect(cells).toHaveLength(25);
    cells.forEach((c) => expect(c.hasAttribute('disabled') || c.getAttribute('aria-disabled') === 'true').toBe(true));
  });
});
