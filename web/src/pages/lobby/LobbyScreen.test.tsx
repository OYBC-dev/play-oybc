import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GameSnapshot } from '../../game/GameClient';
import { appError, FakeGameClient } from '../../game/fakeGameClient';
import { LobbyScreen } from './LobbyScreen';

function snap(over: { host?: boolean; shortfalls?: Record<string, number>; poolSize?: number } = {}): GameSnapshot {
  const host = over.host ?? true;
  const view = [
    { taskId: 't1', authorName: 'Pat', text: 'Someone spills wine', mine: false },
    { taskId: 't2', authorName: 'Cody', text: null, mine: false },
    { taskId: 't3', authorName: 'Me', text: 'My own task', mine: true },
  ];
  for (let i = 0; i < (over.poolSize ?? 0); i++) view.push({ taskId: `x${i}`, authorName: 'Pat', text: `extra ${i}`, mine: false });
  return {
    game: { code: 'ABCDE', stage: 'lobby', hostSeatId: host ? 's1' : 's2', createdAt: 0, bingoCount: 0, shortfalls: over.shortfalls ?? {}, reviewGate: false },
    mySeatId: 's1',
    seats: [
      { seatId: 's1', name: 'Me', nameKey: 'me', joinedAt: 1 },
      { seatId: 's2', name: 'Cody', nameKey: 'cody', joinedAt: 2 },
      { seatId: 's3', name: 'Pat', nameKey: 'pat', joinedAt: 3 },
    ],
    view,
    board: null,
    bingos: [],
    reclaims: [],
  };
}

function setup(s: GameSnapshot) {
  const client = new FakeGameClient();
  const utils = render(<LobbyScreen client={client} snapshot={s} gameId="g1" />);
  return { client, ...utils };
}

describe('LobbyScreen', () => {
  it('renders entries; blurred ones show author and no task text', () => {
    const { container } = setup(snap());
    expect(screen.getByText('Someone spills wine')).toBeInTheDocument();
    const blurred = screen.getByTestId('redacted').closest('li')!;
    expect(within(blurred).getByText('Cody')).toBeInTheDocument();
    expect(blurred.textContent).toBe('Cody×');
    expect(container.querySelectorAll('[data-testid="redacted"]')).toHaveLength(1);
  });

  it('shows delete on own entries, and on every entry for the host only', () => {
    setup(snap({ host: false }));
    expect(screen.getAllByRole('button', { name: /^Delete/ })).toHaveLength(1);
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
    expect(client.calls).toContainEqual(['addTask', 'g1', 'Hi @Cody dances']);
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

  it('surfaces a failed delete and disables the row while in flight', async () => {
    const { client } = setup(snap());
    let reject!: (e: Error) => void;
    client.deleteTask = (() => new Promise<void>((_, r) => { reject = r; })) as never;
    const btn = screen.getByRole('button', { name: 'Delete task: Someone spills wine' });
    await userEvent.click(btn);
    expect(btn).toBeDisabled();
    await act(async () => reject(appError('not-host')));
    expect(await screen.findByText('Only the host can do that')).toBeInTheDocument();
    expect(btn).toBeEnabled();
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

  it('lists every player and marks the host', () => {
    setup(snap());
    const players = within(screen.getByRole('list', { name: 'Players' }));
    expect(players.getAllByRole('listitem')).toHaveLength(3);
    expect(players.getByText('Host')).toBeInTheDocument();
  });

  it('host sees code, link, QR; non-host sees code only', () => {
    const { unmount } = setup(snap());
    expect(screen.getByText('ABCDE')).toBeInTheDocument();
    const link = `${window.location.origin}/g/ABCDE`;
    expect(screen.getByRole('link', { name: link })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'QR code' }).querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    unmount();
    setup(snap({ host: false }));
    expect(screen.getByText('ABCDE')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'QR code' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Launch' })).toBeNull();
  });

  it('disables Launch with shortfall lines', () => {
    setup(snap({ shortfalls: { s2: 3, s3: 1 }, poolSize: 30 }));
    expect(screen.getByText('Cody needs 3 more tasks')).toBeInTheDocument();
    expect(screen.getByText('Pat needs 1 more task')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Launch' })).toBeDisabled();
  });

  it('disables Launch below 24 and enables it at 24 with no shortfalls', async () => {
    const { client, unmount } = setup(snap({ poolSize: 5 }));
    expect(screen.getByText('8 / 24')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Launch' })).toBeDisabled();
    unmount();
    const ready = setup(snap({ poolSize: 21 }));
    expect(screen.getByText('24 / 24')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Launch' }));
    expect(ready.client.calls).toContainEqual(['launch', 'g1']);
    expect(client.calls).not.toContainEqual(['launch', 'g1']);
  });
});
