import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    expect(client.calls).toContainEqual(['toggleMark', 'g1', 3]);
  });

  it('shows a banner for a new bingo from another player, tap dismisses', async () => {
    const client = new FakeGameClient();
    const { rerender } = render(<PlayScreen client={client} snapshot={snap()} gameId="g1" />);
    rerender(<PlayScreen client={client} snapshot={snap({ bingos: [bingo(1, 'Cody')] })} gameId="g1" />);
    const banner = await screen.findByText('Cody got a bingo!');
    await userEvent.click(banner);
    expect(screen.queryByText('Cody got a bingo!')).not.toBeInTheDocument();
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

  it('host sees End game, confirm calls end; non-host does not', async () => {
    const client = new FakeGameClient();
    const { unmount } = render(<PlayScreen client={client} snapshot={snap()} gameId="g1" />);
    await userEvent.click(screen.getByRole('button', { name: 'End game' }));
    expect(client.calls.some((c) => c[0] === 'end')).toBe(false);
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'End game' }));
    expect(client.calls).toContainEqual(['end', 'g1']);
    unmount();
    render(<PlayScreen client={client} snapshot={snap({ host: false })} gameId="g1" />);
    expect(screen.queryByRole('button', { name: 'End game' })).not.toBeInTheDocument();
  });
});

describe('EndedScreen', () => {
  it('shows the leaderboard and a read-only final board', () => {
    render(<EndedScreen snapshot={snap({ stage: 'ended', bingos: [bingo(1, 'Cody')] })} />);
    expect(screen.getByText('Cody')).toBeInTheDocument();
    const cells = screen.getAllByRole('button', { name: /Task|Free/ });
    expect(cells).toHaveLength(25);
    cells.forEach((c) => expect(c.hasAttribute('disabled') || c.getAttribute('aria-disabled') === 'true').toBe(true));
  });
});
