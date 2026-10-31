import { MemoryRouter } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GameSnapshot } from '../../game/GameClient';
import { appError, FakeGameClient } from '../../game/fakeGameClient';
import { LobbyScreen } from '../lobby/LobbyScreen';
import { PlayScreen } from '../play/PlayScreen';
import { EndedScreen } from '../play/EndedScreen';
import { HostMenu } from './HostMenu';
import { ReclaimPrompt } from './ReclaimPrompt';

const noop = () => {};

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
    standings: [],
    reclaims: over.reclaims ?? [],
    roster: [],
  };
}

describe('ReclaimPrompt', () => {
  it('shows who wants back in; Allow and Deny resolve the reclaim', async () => {
    const client = new FakeGameClient();
    render(<ReclaimPrompt client={client} gameId="g1" reclaims={[reclaim]} />);
    expect(screen.getByText("Someone wants to take Cody's seat")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Allow' }));
    await userEvent.click(screen.getByRole('button', { name: 'Deny' }));
    expect(client.calls).toContainEqual(['resolveReclaim', 'g1', 'r1', true]);
    expect(client.calls).toContainEqual(['resolveReclaim', 'g1', 'r1', false]);
  });

  it('disables both buttons for the reclaim in flight', async () => {
    const client = new FakeGameClient();
    client.resolveReclaim = () => new Promise(() => {});
    render(<ReclaimPrompt client={client} gameId="g1" reclaims={[reclaim]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Allow' }));
    expect(screen.getByRole('button', { name: 'Allow' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeDisabled();
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
    const { unmount: u1 } = render(<LobbyScreen client={client} snapshot={snap({ reclaims: r })} gameId="g1" onLeave={noop} />);
    expect(screen.getByText("Someone wants to take Cody's seat")).toBeInTheDocument();
    u1();
    const { unmount: u2 } = render(<PlayScreen client={client} snapshot={snap({ stage: 'playing', reclaims: r })} gameId="g1" onLeave={noop} />);
    expect(screen.getByText("Someone wants to take Cody's seat")).toBeInTheDocument();
    u2();
    render(<MemoryRouter><EndedScreen client={client} snapshot={snap({ stage: 'ended', reclaims: r })} gameId="g1" /></MemoryRouter>);
    expect(screen.getByText("Someone wants to take Cody's seat")).toBeInTheDocument();
  });
});

const twoSeats = (s: GameSnapshot): GameSnapshot => ({ ...s, seats: s.seats.slice(0, 1) });

describe('HostMenu', () => {
  const openMenu = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    return screen.getByRole('menu');
  };

  it('dots button opens a popover with Make host, End game and Leave game; first item takes focus', async () => {
    render(<HostMenu client={new FakeGameClient()} gameId="g1" snapshot={snap({ stage: 'playing' })} canEnd onLeave={noop} />);
    const button = screen.getByRole('button', { name: 'Menu' });
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    const menu = await openMenu();
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Make host', 'End game', 'Leave game']);
    expect(items[0]).toHaveFocus();
  });

  it('arrow keys move between items; Escape closes and returns focus to the button', async () => {
    render(<HostMenu client={new FakeGameClient()} gameId="g1" snapshot={snap({ stage: 'playing' })} canEnd onLeave={noop} />);
    const menu = await openMenu();
    await userEvent.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitem', { name: 'End game' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitem', { name: 'Leave game' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitem', { name: 'Make host' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveFocus();
  });

  it('closes on an outside tap', async () => {
    render(<div><p>outside</p><HostMenu client={new FakeGameClient()} gameId="g1" snapshot={snap({ stage: 'playing' })} canEnd onLeave={noop} /></div>);
    await openMenu();
    await userEvent.click(screen.getByText('outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Make host is disabled with no other players, with no extra copy', async () => {
    render(<HostMenu client={new FakeGameClient()} gameId="g1" snapshot={twoSeats(snap({ stage: 'playing' }))} canEnd onLeave={noop} />);
    const menu = await openMenu();
    expect(within(menu).getByRole('menuitem', { name: 'Make host' })).toBeDisabled();
    expect(within(menu).getByRole('menuitem', { name: 'End game' })).toHaveFocus();
    expect(menu).toHaveTextContent(/^Make hostEnd gameLeave game$/);
  });

  it('without canEnd the host menu offers Make host and Leave game', async () => {
    render(<HostMenu client={new FakeGameClient()} gameId="g1" snapshot={snap()} canEnd={false} onLeave={noop} />);
    const menu = await openMenu();
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Make host', 'Leave game']);
  });

  it('a guest gets the menu with Leave game only', async () => {
    render(<HostMenu client={new FakeGameClient()} gameId="g1" snapshot={snap({ host: false, stage: 'playing' })} canEnd onLeave={noop} />);
    const menu = await openMenu();
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Leave game']);
    expect(within(menu).getByRole('menuitem', { name: 'Leave game' })).toHaveFocus();
    expect(within(menu).queryByRole('separator')).toBeNull();
  });

  it('Leave game closes the menu and calls onLeave, with no confirm and no server call', async () => {
    const client = new FakeGameClient();
    const onLeave = vi.fn();
    render(<HostMenu client={client} gameId="g1" snapshot={snap({ host: false })} canEnd onLeave={onLeave} />);
    await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Leave game' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(client.calls).toEqual([]);
  });

  it('Make host: radio list of the other players, confirm disabled until one is chosen, then transfers', async () => {
    const client = new FakeGameClient();
    render(<HostMenu client={client} gameId="g1" snapshot={snap({ stage: 'playing' })} canEnd onLeave={noop} />);
    const menu = await openMenu();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Make host' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: 'Make host' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const radios = within(dialog).getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(['Cody', 'Pat']);
    const confirm = within(dialog).getByRole('button', { name: 'Make host' });
    expect(confirm).toBeDisabled();
    await userEvent.click(radios[1]);
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{ArrowUp}');
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(radios[0]).toHaveFocus();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Make Cody host' }));
    expect(client.calls).toContainEqual(['transferHost', 'g1', 's2']);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Make host Cancel closes without a call and returns focus to the dots button', async () => {
    const client = new FakeGameClient();
    render(<HostMenu client={client} gameId="g1" snapshot={snap({ stage: 'playing' })} canEnd onLeave={noop} />);
    await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Make host' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(client.calls.some((c) => c[0] === 'transferHost')).toBe(false);
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveFocus();
  });

  it('shows the mapped error when the transfer fails', async () => {
    const client = new FakeGameClient();
    client.transferHost = () => Promise.reject(appError('not-host'));
    render(<HostMenu client={client} gameId="g1" snapshot={snap()} canEnd={false} onLeave={noop} />);
    await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Make host' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Pat' }));
    await userEvent.click(screen.getByRole('button', { name: 'Make Pat host' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the host can do that');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('End game: README copy; Cancel makes no call, End game calls end', async () => {
    const client = new FakeGameClient();
    render(<HostMenu client={client} gameId="g1" snapshot={snap({ stage: 'playing' })} canEnd onLeave={noop} />);
    await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'End game' }));
    let dialog = screen.getByRole('dialog', { name: 'End the game?' });
    expect(dialog).toHaveTextContent('Marking stops for everyone and the final leaderboard goes up.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(client.calls.some((c) => c[0] === 'end')).toBe(false);
    await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'End game' }));
    dialog = screen.getByRole('dialog', { name: 'End the game?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'End game' }));
    expect(client.calls).toContainEqual(['end', 'g1']);
  });

  it('End game shows the mapped error and stays open on failure', async () => {
    const client = new FakeGameClient();
    client.end = () => Promise.reject(appError('wrong-stage'));
    render(<HostMenu client={client} gameId="g1" snapshot={snap({ stage: 'playing' })} canEnd onLeave={noop} />);
    await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'End game' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'End game' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That isn't available right now");
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('host-only controls disappear for the old host after a transfer; the menu keeps Leave game', async () => {
    const client = new FakeGameClient();
    const { rerender } = render(<LobbyScreen client={client} snapshot={snap()} gameId="g1" onLeave={noop} />);
    expect(screen.getByRole('button', { name: 'Launch' })).toBeInTheDocument();
    rerender(<LobbyScreen client={client} snapshot={snap({ host: false })} gameId="g1" onLeave={noop} />);
    expect(screen.queryByRole('button', { name: 'Launch' })).not.toBeInTheDocument();
    const menu = await openMenu();
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Leave game']);
  });

  it('after a successful transfer the menu drops its host items and focus returns to the dots button, not <body>', async () => {
    const client = new FakeGameClient();
    let current = snap({ stage: 'playing' });
    const { rerender } = render(<PlayScreen client={client} snapshot={current} gameId="g1" onLeave={noop} />);
    client.transferHost = async () => {
      current = snap({ stage: 'playing', host: false });
      rerender(<PlayScreen client={client} snapshot={current} gameId="g1" onLeave={noop} />);
    };
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Make host' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Cody' }));
    await userEvent.click(screen.getByRole('button', { name: 'Make Cody host' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body).not.toHaveFocus();
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveFocus();
    const menu = await openMenu();
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Leave game']);
  });

  it('host alone: lobby and board both keep a disabled Make host beside End game and Leave game', async () => {
    const { unmount } = render(<LobbyScreen client={new FakeGameClient()} snapshot={twoSeats(snap())} gameId="g1" onLeave={noop} />);
    let menu = await openMenu();
    expect(within(menu).getByRole('menuitem', { name: 'Make host' })).toBeDisabled();
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Make host', 'Roster', 'End game', 'Leave game']);
    unmount();
    render(<PlayScreen client={new FakeGameClient()} snapshot={twoSeats(snap({ stage: 'playing' }))} gameId="g1" onLeave={noop} />);
    menu = await openMenu();
    expect(within(menu).getByRole('menuitem', { name: 'Make host' })).toBeDisabled();
  });

  it('Make host forgets a pick whose player left', async () => {
    const client = new FakeGameClient();
    const { rerender } = render(<HostMenu client={client} gameId="g1" snapshot={snap({ stage: 'playing' })} canEnd onLeave={noop} />);
    await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Make host' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Pat' }));
    expect(screen.getByRole('button', { name: 'Make Pat host' })).toBeEnabled();
    const s = snap({ stage: 'playing' });
    rerender(<HostMenu client={client} gameId="g1" snapshot={{ ...s, seats: s.seats.filter((x) => x.seatId !== 's3') }} canEnd onLeave={noop} />);
    expect(screen.queryByRole('radio', { name: 'Pat' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
    expect(screen.getByRole('button', { name: 'Make host' })).toBeDisabled();
  });

  it('lobby: the host menu offers Make host, Roster, End game and Leave game; End game ends from the lobby', async () => {
    const client = new FakeGameClient();
    const onLeave = vi.fn();
    render(<LobbyScreen client={client} snapshot={snap()} gameId="g1" onLeave={onLeave} />);
    let menu = await openMenu();
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Make host', 'Roster', 'End game', 'Leave game']);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'End game' }));
    const dialog = screen.getByRole('dialog', { name: 'End the game?' });
    expect(dialog).not.toHaveTextContent('Marking stops');
    await userEvent.click(within(dialog).getByRole('button', { name: 'End game' }));
    expect(client.calls).toContainEqual(['end', 'g1']);
    menu = await openMenu();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Leave game' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('lobby: a guest gets the menu with Leave game only', async () => {
    const onLeave = vi.fn();
    render(<LobbyScreen client={new FakeGameClient()} snapshot={snap({ host: false })} gameId="g1" onLeave={onLeave} />);
    const menu = await openMenu();
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Leave game']);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Leave game' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('play screen: every seat has the menu; End game is the host\'s only', async () => {
    const client = new FakeGameClient();
    const { rerender } = render(<PlayScreen client={client} snapshot={snap({ stage: 'playing' })} gameId="g1" onLeave={noop} />);
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument();
    rerender(<PlayScreen client={client} snapshot={snap({ stage: 'playing', host: false })} gameId="g1" onLeave={noop} />);
    const menu = await openMenu();
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Leave game']);
    expect(screen.queryByRole('menuitem', { name: 'End game' })).not.toBeInTheDocument();
  });
});
