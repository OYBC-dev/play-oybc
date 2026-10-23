import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GameSnapshot } from '../../game/GameClient';
import { appError, FakeGameClient } from '../../game/fakeGameClient';
import { LobbyScreen } from '../lobby/LobbyScreen';
import { PlayScreen } from '../play/PlayScreen';
import { EndedScreen } from '../play/EndedScreen';
import { HostMenu } from './HostMenu';
import { ReclaimPrompt } from './ReclaimPrompt';

const reclaim = { id: 'r1', requesterUid: 'u9', name: 'Cody', seatId: 's2', status: 'pending' as const, createdAt: 1 };

function snap(over: { host?: boolean; stage?: 'lobby' | 'playing' | 'ended'; reclaims?: GameSnapshot['reclaims'] } = {}): GameSnapshot {
  const cells = Array.from({ length: 25 }, (_, i) =>
    i === 12 ? ({ kind: 'free' } as const) : ({ kind: 'task', taskId: `t${i}`, text: `Task ${i}` } as const),
  );
  const stage = over.stage ?? 'lobby';
  return {
    game: { code: 'ABCDE', stage, hostSeatId: over.host === false ? 's2' : 's1', createdAt: 0, bingoCount: 0, shortfalls: {}, reviewGate: false },
    mySeatId: 's1',
    seats: [
      { seatId: 's1', name: 'Me', nameKey: 'me', joinedAt: 1 },
      { seatId: 's2', name: 'Cody', nameKey: 'cody', joinedAt: 2 },
      { seatId: 's3', name: 'Pat', nameKey: 'pat', joinedAt: 3 },
    ],
    view: [],
    board: stage === 'lobby' ? null : { cells, marks: cells.map((_, i) => i === 12), completedLines: [], announcedLines: [] },
    bingos: [],
    reclaims: over.reclaims ?? [],
  };
}

describe('ReclaimPrompt', () => {
  it('shows who wants back in; Allow and Deny resolve the reclaim', async () => {
    const client = new FakeGameClient();
    render(<ReclaimPrompt client={client} gameId="g1" reclaims={[reclaim]} />);
    expect(screen.getByText('Cody wants back in')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Allow' }));
    await userEvent.click(screen.getByRole('button', { name: 'Deny' }));
    expect(client.calls).toContainEqual(['resolveReclaim', 'g1', 'r1', true]);
    expect(client.calls).toContainEqual(['resolveReclaim', 'g1', 'r1', false]);
  });

  it('renders nothing without reclaims and shows the mapped error on failure', async () => {
    const client = new FakeGameClient();
    const { container, rerender } = render(<ReclaimPrompt client={client} gameId="g1" reclaims={[]} />);
    expect(container).toBeEmptyDOMElement();
    client.resolveReclaim = () => Promise.reject(appError('wrong-stage'));
    rerender(<ReclaimPrompt client={client} gameId="g1" reclaims={[reclaim]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Allow' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That isn't available right now");
  });

  it('appears on lobby, play and ended screens for the host', () => {
    const client = new FakeGameClient();
    const r = [reclaim];
    const { unmount: u1 } = render(<LobbyScreen client={client} snapshot={snap({ reclaims: r })} gameId="g1" />);
    expect(screen.getByText('Cody wants back in')).toBeInTheDocument();
    u1();
    const { unmount: u2 } = render(<PlayScreen client={client} snapshot={snap({ stage: 'playing', reclaims: r })} gameId="g1" />);
    expect(screen.getByText('Cody wants back in')).toBeInTheDocument();
    u2();
    render(<EndedScreen client={client} snapshot={snap({ stage: 'ended', reclaims: r })} gameId="g1" />);
    expect(screen.getByText('Cody wants back in')).toBeInTheDocument();
  });
});

describe('HostMenu', () => {
  it('lists the other seats; Make host asks to confirm, then transfers', async () => {
    const client = new FakeGameClient();
    render(<HostMenu client={client} gameId="g1" snapshot={snap()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Host menu' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText('Me')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Pat')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Make Cody host' }));
    expect(client.calls.some((c) => c[0] === 'transferHost')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Make host' }));
    expect(client.calls).toContainEqual(['transferHost', 'g1', 's2']);
  });

  it('shows the mapped error when the transfer fails', async () => {
    const client = new FakeGameClient();
    client.transferHost = () => Promise.reject(appError('not-host'));
    render(<HostMenu client={client} gameId="g1" snapshot={snap()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Host menu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Make Pat host' }));
    await userEvent.click(screen.getByRole('button', { name: 'Make host' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the host can do that');
  });

  it('host-only controls disappear for the old host after a transfer', () => {
    const client = new FakeGameClient();
    const { rerender } = render(<LobbyScreen client={client} snapshot={snap()} gameId="g1" />);
    expect(screen.getByRole('button', { name: 'Host menu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Launch' })).toBeInTheDocument();
    rerender(<LobbyScreen client={client} snapshot={snap({ host: false })} gameId="g1" />);
    expect(screen.queryByRole('button', { name: 'Host menu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Launch' })).not.toBeInTheDocument();
  });

  it('is on the play screen for the host only', () => {
    const client = new FakeGameClient();
    const { rerender } = render(<PlayScreen client={client} snapshot={snap({ stage: 'playing' })} gameId="g1" />);
    expect(screen.getByRole('button', { name: 'Host menu' })).toBeInTheDocument();
    rerender(<PlayScreen client={client} snapshot={snap({ stage: 'playing', host: false })} gameId="g1" />);
    expect(screen.queryByRole('button', { name: 'Host menu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'End game' })).not.toBeInTheDocument();
  });
});
