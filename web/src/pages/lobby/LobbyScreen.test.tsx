import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GameSnapshot, SnapshotGame } from '../../game/GameClient';
import { appError, FakeGameClient } from '../../game/fakeGameClient';
import { LobbyScreen } from './LobbyScreen';
import { nonsenseFor } from './nonsense';

const noop = () => {};

function snap(over: {
  host?: boolean; shortfalls?: Record<string, number>; poolSize?: number; alone?: boolean; empty?: boolean; game?: Partial<SnapshotGame>;
} = {}): GameSnapshot {
  const host = over.host ?? true;
  const view = over.empty ? [] : [
    { taskId: 't1', authorName: 'Pat', text: 'Someone carves the pumpkin', mine: false },
    { taskId: 't2', authorName: 'Cody', text: null, mine: false },
    { taskId: 't3', authorName: 'Me', text: 'My own task', mine: true },
  ];
  for (let i = 0; i < (over.poolSize ?? 0); i++) view.push({ taskId: `x${i}`, authorName: 'Pat', text: `extra ${i}`, mine: false });
  return {
    game: { code: 'ABCDE', stage: 'lobby', hostSeatId: host ? 's1' : 's2', createdAt: 0, bingoCount: 0, shortfalls: over.shortfalls ?? {}, reviewGate: false, ...over.game },
    mySeatId: 's1',
    seats: [
      { seatId: 's1', name: 'Me', nameKey: 'me', joinedAt: 1 },
      { seatId: 's2', name: 'Cody', nameKey: 'cody', joinedAt: 2 },
      { seatId: 's3', name: 'Pat', nameKey: 'pat', joinedAt: 3 },
    ].slice(0, over.alone ? 1 : 3),
    view,
    board: null,
    bingos: [],
    standings: [],
    reclaims: [],
  };
}

function setup(s: GameSnapshot) {
  const client = new FakeGameClient();
  const utils = render(<LobbyScreen client={client} snapshot={s} gameId="g1" onLeave={noop} />);
  return { client, ...utils };
}

describe('LobbyScreen', () => {
  it('renders entries; blurred ones show the author and two copies of per-task nonsense, never task text', () => {
    const { container } = setup(snap());
    expect(screen.getByText('Someone carves the pumpkin')).toBeInTheDocument();
    const redacted = screen.getByRole('img', { name: 'Hidden task' });
    expect(redacted).toHaveAttribute('data-testid', 'redacted');
    const row = redacted.closest('li')!;
    expect(within(row).getByText('Cody')).toBeInTheDocument();
    const copies = redacted.querySelectorAll('span[aria-hidden="true"]');
    expect(copies).toHaveLength(2);
    const fake = nonsenseFor('t2');
    copies.forEach((c) => expect(c.textContent).toBe(fake));
    expect(fake.length).toBeGreaterThanOrEqual(18);
    expect(fake.length).toBeLessThanOrEqual(60);
    expect(row.textContent).toBe(`${fake}${fake}Cody`);
    expect(container.querySelectorAll('[data-testid="redacted"]')).toHaveLength(1);
  });

  it('shows the trash only on own entries for a player', () => {
    setup(snap({ host: false }));
    const buttons = screen.getAllByRole('button', { name: /^Delete/ });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName('Delete task: My own task');
    expect(buttons[0].querySelector('svg')).not.toBeNull();
  });

  it('host sees delete on every entry and deleting calls the client', async () => {
    const { client } = setup(snap());
    const buttons = screen.getAllByRole('button', { name: /^Delete/ });
    expect(buttons).toHaveLength(3);
    await userEvent.click(buttons[0]);
    expect(client.calls).toContainEqual(['deleteTask', 'g1', 't1']);
  });

  it('autocompletes mentions and submits', async () => {
    const { client } = setup(snap());
    await userEvent.type(screen.getByLabelText('Task'), 'Hi @co');
    const list = screen.getByRole('listbox');
    expect(within(list).getByText('Cody')).toBeInTheDocument();
    expect(within(list).queryByText('Me')).toBeNull();
    await userEvent.click(within(list).getByText('Cody'));
    expect(screen.getByLabelText('Task')).toHaveValue('Hi @Cody ');
    await userEvent.type(screen.getByLabelText('Task'), 'dances');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(client.calls).toContainEqual(['addTask', 'g1', 'Hi @Cody dances', expect.any(String)]);
  });

  it('offers someone and anyone, and picks with the keyboard', async () => {
    setup(snap());
    await userEvent.type(screen.getByLabelText('Task'), '@');
    expect(screen.getByText('someone')).toBeInTheDocument();
    expect(screen.getByText('anyone')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Task'), 'an{Enter}');
    expect(screen.getByLabelText('Task')).toHaveValue('@anyone ');
  });

  it('shows server mention errors', async () => {
    const { client } = setup(snap());
    client.addTask = () => Promise.reject(Object.assign(appError('unknown-mention'), { details: { code: 'unknown-mention', token: '@Bob' } }));
    await userEvent.type(screen.getByLabelText('Task'), 'Hey @Bob');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('No player named @Bob')).toBeInTheDocument();
    client.addTask = () => Promise.reject(appError('self-mention'));
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText("You can't mention yourself")).toBeInTheDocument();
  });

  it('a delete hides the row at once; a failed delete restores it and shows the error', async () => {
    const { client } = setup(snap());
    let reject!: (e: Error) => void;
    client.deleteTask = (() => new Promise<void>((_, r) => { reject = r; })) as never;
    await userEvent.click(screen.getByRole('button', { name: 'Delete task: Someone carves the pumpkin' }));
    expect(screen.queryByText('Someone carves the pumpkin')).toBeNull();
    await act(async () => reject(appError('not-host')));
    expect(await screen.findByText('Only the host can do that')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete task: Someone carves the pumpkin' })).toBeEnabled();
  });

  it('a successful delete keeps the row hidden until the server view drops it', async () => {
    const s = snap();
    const { client, rerender } = setup(s);
    let resolve!: () => void;
    client.deleteTask = (() => new Promise<void>((r) => { resolve = r; })) as never;
    await userEvent.click(screen.getByRole('button', { name: 'Delete task: Someone carves the pumpkin' }));
    await act(async () => resolve());
    expect(screen.queryByText('Someone carves the pumpkin')).toBeNull();
    rerender(<LobbyScreen client={client} snapshot={{ ...s, view: s.view.slice(1) }} gameId="g1" onLeave={noop} />);
    expect(screen.queryByText('Someone carves the pumpkin')).toBeNull();
  });

  it('add shows an optimistic row that is replaced by the server view', async () => {
    const s = snap();
    const { client, rerender } = setup(s);
    let resolve!: () => void;
    let sentId = '';
    client.addTask = ((_g: string, _t: string, taskId?: string) => {
      sentId = taskId ?? '';
      return new Promise<void>((r) => { resolve = r; });
    }) as never;
    await userEvent.type(screen.getByLabelText('Task'), 'Fresh task');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(sentId).not.toBe('');
    const row = screen.getByText('Fresh task').closest('li')!;
    expect(row).toHaveAttribute('data-pending', 'true');
    expect(within(row).getByText('You')).toBeInTheDocument();
    await act(async () => resolve());
    expect(screen.getByText('Fresh task')).toBeInTheDocument();
    rerender(<LobbyScreen client={client} snapshot={{ ...s, view: [...s.view, { taskId: sentId, authorName: 'Me', text: 'Fresh task', mine: true }] }} gameId="g1" onLeave={noop} />);
    expect(screen.getAllByText('Fresh task')).toHaveLength(1);
    expect(screen.getByText('Fresh task').closest('li')).not.toHaveAttribute('data-pending');
  });

  it('a failed add removes its optimistic row and shows the error', async () => {
    const { client } = setup(snap());
    let reject!: (e: Error) => void;
    client.addTask = (() => new Promise<void>((_, r) => { reject = r; })) as never;
    await userEvent.type(screen.getByLabelText('Task'), 'Doomed');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Doomed', { selector: 'span' })).toBeInTheDocument();
    await act(async () => reject(appError('invalid-text')));
    expect(await screen.findByText('Task text is empty or too long')).toBeInTheDocument();
    expect(screen.queryByText('Doomed', { selector: 'span' })).toBeNull();
  });

  it('retrying a failed add sends the same taskId', async () => {
    const { client } = setup(snap());
    const ids: string[] = [];
    client.addTask = ((_g: string, _t: string, taskId?: string) => {
      ids.push(taskId ?? '');
      return Promise.reject(appError('offline'));
    }) as never;
    await userEvent.type(screen.getByLabelText('Task'), 'Again');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe('');
    expect(ids[1]).toBe(ids[0]);
  });

  it('closes the autocomplete on blur and leaves Tab alone', async () => {
    setup(snap());
    const input = screen.getByLabelText('Task');
    await userEvent.type(input, '@co');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await userEvent.tab();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input).toHaveValue('@co');
  });

  it('keeps text typed while a submit is in flight', async () => {
    const { client } = setup(snap());
    let resolve!: () => void;
    client.addTask = (() => new Promise<void>((r) => { resolve = r; })) as never;
    const input = screen.getByLabelText('Task');
    await userEvent.type(input, 'one');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await userEvent.type(input, ' two');
    await act(async () => resolve());
    expect(input).toHaveValue('one two');
  });

  it('header shows Pool, my dealable count over the board size, and the pool size', () => {
    setup(snap({ poolSize: 27, game: { tasksPerBoard: 25, dealable: { s1: 6, s2: 30 }, freeSpace: false } }));
    expect(screen.getByRole('heading', { name: 'Pool' })).toBeInTheDocument();
    expect(screen.getByTestId('pool-count')).toHaveTextContent(/^6 \/ 25$/);
    expect(screen.getByText('30 in pool')).toBeInTheDocument();
  });

  it('a game frame without dealable or tasksPerBoard reads 0 / 25', () => {
    setup(snap({ poolSize: 5 }));
    expect(screen.getByTestId('pool-count')).toHaveTextContent(/^0 \/ 25$/);
    expect(screen.getByText('8 in pool')).toBeInTheDocument();
  });

  it('pool rows render mentions in bold with no @', () => {
    const s = snap();
    s.view[0] = { taskId: 't1', authorName: 'Pat', text: 'Cody carves the pumpkin', refs: [[0, 4]], mine: false };
    setup(s);
    const bold = screen.getByText('Cody', { selector: 'b' });
    const row = bold.closest('li')!;
    expect(row.textContent).not.toContain('@');
    expect(within(row).getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'Cody carves the pumpkin')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Delete task: Cody carves the pumpkin' })).toBeInTheDocument();
  });

  it('host sees the Free space switch; toggling sends setOptions, disabled while in flight, no optimistic flip', async () => {
    const { client, rerender } = setup(snap({ game: { freeSpace: false, tasksPerBoard: 25 } }));
    let resolve!: () => void;
    const setOptions = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    client.setOptions = setOptions;
    const sw = within(screen.getByTestId('lobby-sheet')).getByRole('switch', { name: 'Free space' });
    expect(sw).not.toBeChecked();
    await userEvent.click(sw);
    expect(setOptions).toHaveBeenCalledWith('g1', { freeSpace: true });
    expect(sw).toBeDisabled();
    expect(sw).not.toBeChecked();
    await act(async () => resolve());
    expect(sw).toBeEnabled();
    expect(sw).not.toBeChecked();
    rerender(<LobbyScreen client={client} snapshot={snap({ game: { freeSpace: true, tasksPerBoard: 24 } })} gameId="g1" onLeave={noop} />);
    expect(screen.getByRole('switch', { name: 'Free space' })).toBeChecked();
  });

  it('a failed Free space change shows its error and leaves the switch as the server has it', async () => {
    const { client } = setup(snap({ game: { freeSpace: true } }));
    client.setOptions = () => Promise.reject(appError('not-host'));
    await userEvent.click(screen.getByRole('switch', { name: 'Free space' }));
    expect(await screen.findByText('Only the host can do that')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Free space' })).toBeChecked();
  });

  it('guests get no Free space row', () => {
    setup(snap({ host: false, game: { freeSpace: true } }));
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText('Free space')).toBeNull();
  });

  it('composer has the pool placeholder and a neutral Add', () => {
    setup(snap());
    expect(screen.getByLabelText('Task')).toHaveAttribute('placeholder', 'Add to the pool');
    const add = screen.getByRole('button', { name: 'Add' });
    expect(add).toHaveClass('neutral');
    expect(add).not.toHaveClass('fullWidth');
  });

  it('avatar stack toggles the player chips; the host chip carries the Host badge', async () => {
    setup(snap());
    const stack = screen.getByRole('button', { name: '3 players' });
    expect(stack).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Players' })).toBeNull();
    await userEvent.click(stack);
    expect(stack).toHaveAttribute('aria-expanded', 'true');
    expect(stack.getAttribute('aria-controls')).toBe(screen.getByRole('list', { name: 'Players' }).id);
    expect(stack.getAttribute('aria-controls')).not.toBe('');
    const players = within(screen.getByRole('list', { name: 'Players' }));
    expect(players.getAllByRole('listitem')).toHaveLength(3);
    const hostChip = players.getByText('Host').closest('li')!;
    expect(hostChip).toHaveTextContent('MeHost');
    expect(players.getByText('Host')).toHaveClass('expiring');
    await userEvent.click(stack);
    expect(screen.queryByRole('list', { name: 'Players' })).toBeNull();
  });

  it('header carries the dots menu for every seat', () => {
    const { unmount } = setup(snap());
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-haspopup', 'menu');
    unmount();
    setup(snap({ host: false }));
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('empty lobby: only the host, a waiting pill and no tasks yet', () => {
    setup(snap({ alone: true, empty: true }));
    expect(screen.getByRole('button', { name: '1 player' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for players');
    expect(screen.getByText('No tasks yet')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Pool' })).toBeNull();
    expect(within(screen.getByTestId('lobby-sheet')).getByText('0 / 25')).toBeInTheDocument();
  });

  it('no waiting pill once someone else has joined', () => {
    setup(snap());
    expect(screen.queryByText('Waiting for players')).toBeNull();
  });

  it('host sheet shows the code, a QR tile and Launch; tapping the tile expands it', async () => {
    setup(snap({ shortfalls: { s2: 1 } }));
    const sheet = within(screen.getByTestId('lobby-sheet'));
    expect(sheet.getByLabelText('Game code')).toHaveTextContent('ABCDE');
    expect(sheet.getByRole('button', { name: 'Launch' })).toHaveClass('primary', 'large');
    expect(sheet.queryByRole('link')).toBeNull();
    expect(sheet.queryByText(/\/g\/ABCDE/)).toBeNull();
    const tile = sheet.getByRole('button', { name: 'Share' });
    expect(tile.querySelector('svg')).not.toBeNull();
    expect(sheet.queryByRole('img', { name: 'QR code' })).toBeNull();
    expect(sheet.queryByRole('button', { name: 'Copy link' })).toBeNull();
    await userEvent.click(tile);
    expect(tile).toHaveAttribute('aria-expanded', 'true');
    expect(sheet.getByRole('img', { name: 'QR code' }).querySelector('svg')).not.toBeNull();
    expect(sheet.getByRole('button', { name: 'Copy link' })).toHaveClass('neutral', 'fullWidth');
    await userEvent.click(sheet.getByRole('button', { name: 'Done' }));
    expect(sheet.queryByRole('img', { name: 'QR code' })).toBeNull();
  });

  it('Copy link writes the join link, reads Copied, and reverts after 2s', async () => {
    vi.useFakeTimers();
    try {
      setup(snap({ host: false }));
      const writeText = vi.fn(() => Promise.resolve());
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy link' })); });
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/g/ABCDE`);
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(1999); });
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(1); });
      expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the Copied timer on unmount', async () => {
    vi.useFakeTimers();
    try {
      const { unmount } = setup(snap({ host: false }));
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.resolve() }, configurable: true });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy link' })); });
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a clipboard failure leaves Copy link', async () => {
    setup(snap({ host: false }));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy link' })); });
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull();
  });

  it('twenty short seats: the shortfall lines are their own scroll block; code, QR and Launch stay', () => {
    const s = snap();
    s.seats = Array.from({ length: 20 }, (_, i) => ({ seatId: `p${i}`, name: `Player Number ${i} With A Long Name`, nameKey: `p${i}`, joinedAt: i }));
    s.game.shortfalls = Object.fromEntries(s.seats.map((seat, i) => [seat.seatId, i + 1]));
    s.game.hostSeatId = 's1';
    setup(s);
    const block = screen.getByTestId('shortfalls');
    expect(block).toHaveClass('shorts');
    expect(block.children).toHaveLength(20);
    const sheet = within(screen.getByTestId('lobby-sheet'));
    expect(block.contains(sheet.getByLabelText('Game code'))).toBe(false);
    expect(block.contains(sheet.getByRole('button', { name: 'Share' }))).toBe(false);
    expect(block.contains(sheet.getByRole('button', { name: 'Launch' }))).toBe(false);
  });

  it('player sheet has the code and a small Copy link, no QR or Launch', () => {
    setup(snap({ host: false }));
    const sheet = within(screen.getByTestId('lobby-sheet'));
    expect(sheet.getByLabelText('Game code')).toHaveTextContent('ABCDE');
    expect(sheet.getByRole('button', { name: 'Copy link' })).toHaveClass('neutral', 'small');
    expect(sheet.queryByRole('button', { name: 'Share' })).toBeNull();
    expect(screen.queryByRole('img', { name: 'QR code' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Launch' })).toBeNull();
  });

  it('shows red shortfall lines and disables Launch', () => {
    setup(snap({ shortfalls: { s2: 3, s3: 1 }, poolSize: 30 }));
    const sheet = within(screen.getByTestId('lobby-sheet'));
    expect(sheet.getByText('Cody needs 3 more tasks')).toHaveClass('short');
    expect(sheet.getByText('Pat needs 1 more task')).toBeInTheDocument();
    expect(sheet.getByRole('button', { name: 'Launch' })).toBeDisabled();
    expect(screen.getByTestId('lobby-sheet')).not.toHaveAttribute('data-ready');
  });

  it('Launch waits on shortfalls only; with none the sheet goes ready, shows mine / needed, and Launch is dark', async () => {
    const { client, unmount } = setup(snap({ shortfalls: { s1: 2 }, poolSize: 40 }));
    expect(screen.getByRole('button', { name: 'Launch' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Launch' })).toHaveClass('primary');
    unmount();
    const ready = setup(snap({ poolSize: 2, game: { tasksPerBoard: 25, dealable: { s1: 25 } } }));
    expect(within(screen.getByTestId('lobby-sheet')).getByText('25 / 25')).toBeInTheDocument();
    const sheet = screen.getByTestId('lobby-sheet');
    expect(sheet).toHaveAttribute('data-ready', 'true');
    expect(sheet).toHaveClass('ready');
    const launch = screen.getByRole('button', { name: 'Launch' });
    expect(launch).toHaveClass('dark');
    expect(launch).toBeEnabled();
    await userEvent.click(launch);
    expect(ready.client.calls).toContainEqual(['launch', 'g1']);
    expect(client.calls).not.toContainEqual(['launch', 'g1']);
  });

  it('surfaces a failed launch', async () => {
    const { client } = setup(snap());
    client.launch = () => Promise.reject(appError('not-host'));
    await userEvent.click(screen.getByRole('button', { name: 'Launch' }));
    expect(await screen.findByText('Only the host can do that')).toBeInTheDocument();
  });
});
