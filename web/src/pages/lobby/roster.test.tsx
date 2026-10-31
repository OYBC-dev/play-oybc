import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RosterName } from 'game-core';
import type { GameSnapshot } from '../../game/GameClient';
import { appError, FakeGameClient } from '../../game/fakeGameClient';
import { HOW_TO_SEEN_KEY } from './howTo';
import { LobbyScreen } from './LobbyScreen';

const ROSTER: RosterName[] = [
  { key: 'jess', display: 'Jess', seatId: null },
  { key: 'bo', display: 'Bo', seatId: 's2' },
];

function snap(host: boolean, roster: RosterName[] = ROSTER): GameSnapshot {
  return {
    game: { code: 'ABCDE', stage: 'lobby', hostSeatId: host ? 's1' : 's2', createdAt: 0, bingoCount: 0, shortfalls: {}, reviewGate: false },
    mySeatId: 's1',
    seats: [
      { seatId: 's1', name: 'Me', nameKey: 'me', joinedAt: 1 },
      { seatId: 's2', name: 'Cody', nameKey: 'cody', joinedAt: 2 },
      { seatId: 's3', name: 'Jessie', nameKey: 'jessie', joinedAt: 3 },
    ],
    view: [],
    board: null,
    bingos: [],
    standings: [],
    reclaims: [],
    roster,
  };
}

function setup(s: GameSnapshot) {
  const client = new FakeGameClient();
  const utils = render(<LobbyScreen client={client} snapshot={s} gameId="g1" onLeave={() => {}} />);
  return { client, ...utils };
}

async function openPlayers() {
  await userEvent.click(screen.getByRole('button', { name: '3 players' }));
  return within(screen.getByRole('list', { name: 'Players' }));
}

const rerenderWith = (rerender: (ui: React.ReactElement) => void, client: FakeGameClient, s: GameSnapshot) =>
  rerender(<LobbyScreen client={client} snapshot={s} gameId="g1" onLeave={() => {}} />);

// These suites are about the lobby itself: the first-lobby explainer is covered in howTo.test.tsx.
beforeEach(() => localStorage.setItem(HOW_TO_SEEN_KEY, '1'));

describe('roster in the lobby', () => {
  it('host: an unbound name is a dashed chip button after the players, a bound name a tag button inside its player', async () => {
    setup(snap(true));
    const players = await openPlayers();
    expect(players.getAllByRole('listitem')).toHaveLength(4);
    const jess = players.getByRole('button', { name: 'Jess, nobody yet' });
    expect(jess).toHaveClass('chip');
    expect(jess.closest('li')).toBe(players.getAllByRole('listitem')[3]);
    const bo = players.getByRole('button', { name: 'Bo, bound to Cody' });
    expect(bo).toHaveClass('tag', 'tagButton');
    expect(bo.closest('li')).toHaveTextContent('CodyBo');
  });

  it('guest: the dashed chip and the tag are static and muted', async () => {
    setup(snap(false));
    const players = await openPlayers();
    expect(players.queryByRole('button')).toBeNull();
    expect(players.getByText('Jess').closest('[class*="chip"]')).toHaveClass('static');
    expect(players.getByText('Bo').parentElement).toHaveClass('tag', 'tagStatic');
    expect(players.getByText('Bo').closest('li')).toHaveTextContent('CodyHostBo');
  });

  it('the bind sheet lists Nobody yet first, then every player; a pick stays selected until the snapshot shows it', async () => {
    const { client, rerender } = setup(snap(true));
    const players = await openPlayers();
    await userEvent.click(players.getByRole('button', { name: 'Jess, nobody yet' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Jess' }));
    const group = within(dialog.getByRole('radiogroup', { name: 'Players' }));
    expect(group.getAllByRole('radio').map((r) => r.textContent)).toEqual(['Nobody yet', 'Me', 'Cody', 'Jessie']);
    expect(group.getByRole('radio', { name: 'Nobody yet' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(group.getByRole('radio', { name: 'Jessie' }));
    expect(client.calls).toContainEqual(['bindName', 'g1', 'jess', 's3']);
    // Acked, but the snapshot still says unbound: the pick holds (no flicker back to Nobody yet).
    expect(group.getByRole('radio', { name: 'Jessie' })).toHaveAttribute('aria-checked', 'true');
    expect(group.getByRole('radio', { name: 'Nobody yet' })).toHaveAttribute('aria-checked', 'false');
    rerenderWith(rerender, client, snap(true, ROSTER));
    expect(group.getByRole('radio', { name: 'Jessie' })).toHaveAttribute('aria-checked', 'true');
    rerenderWith(rerender, client, snap(true, [{ key: 'jess', display: 'Jess', seatId: 's3' }, ROSTER[1]]));
    expect(group.getByRole('radio', { name: 'Jessie' })).toHaveAttribute('aria-checked', 'true');
    // Bound now: no Not coming.
    expect(dialog.queryByRole('button', { name: 'Not coming' })).toBeNull();
    await userEvent.click(group.getByRole('radio', { name: 'Nobody yet' }));
    expect(client.calls).toContainEqual(['bindName', 'g1', 'jess', null]);
    expect(group.getByRole('radio', { name: 'Nobody yet' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a bound tag opens the sheet on its player, with no Not coming', async () => {
    setup(snap(true));
    const players = await openPlayers();
    await userEvent.click(players.getByRole('button', { name: 'Bo, bound to Cody' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Bo' }));
    expect(dialog.getByRole('radio', { name: 'Cody' })).toHaveAttribute('aria-checked', 'true');
    expect(dialog.queryByRole('button', { name: 'Not coming' })).toBeNull();
  });

  it('a failed bind shows the error and goes back to the old selection', async () => {
    const { client } = setup(snap(true));
    client.bindResult = appError('seat-not-found');
    const players = await openPlayers();
    await userEvent.click(players.getByRole('button', { name: 'Jess, nobody yet' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Jess' }));
    await userEvent.click(dialog.getByRole('radio', { name: 'Cody' }));
    expect(dialog.getByRole('alert')).toHaveTextContent('That player left');
    expect(dialog.getByRole('radio', { name: 'Nobody yet' })).toHaveAttribute('aria-checked', 'true');
  });

  it('Not coming asks "<Name> isn’t coming?", then retires the name, closes, and the chip goes', async () => {
    const { client, rerender } = setup(snap(true));
    const players = await openPlayers();
    await userEvent.click(players.getByRole('button', { name: 'Jess, nobody yet' }));
    await userEvent.click(screen.getByRole('button', { name: 'Not coming' }));
    const confirm = within(screen.getByRole('dialog', { name: 'Jess isn’t coming?' }));
    await userEvent.click(confirm.getByRole('button', { name: 'Cancel' }));
    expect(client.calls.some((c) => c[0] === 'retireName')).toBe(false);
    expect(screen.getByRole('dialog', { name: 'Jess' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Not coming' }));
    const retire = within(screen.getByRole('dialog', { name: 'Jess isn’t coming?' })).getByRole('button', { name: 'Not coming' });
    expect(retire).toHaveClass('primary');
    await userEvent.click(retire);
    expect(client.calls).toContainEqual(['retireName', 'g1', 'jess']);
    expect(screen.queryByRole('dialog')).toBeNull();
    // The name leaves the roster: its chip stops being a button at once and collapses out.
    await act(async () => { rerenderWith(rerender, client, snap(true, [ROSTER[1]])); });
    const list = within(screen.getByRole('list', { name: 'Players' }));
    expect(list.queryByRole('button', { name: /^Jess/ })).toBeNull();
    await waitFor(() => expect(list.queryByText('Jess')).toBeNull());
  });

  it('the host menu Roster item counts the unbound names and expands the chip list', async () => {
    const { rerender, client } = setup(snap(true));
    expect(screen.queryByRole('list', { name: 'Players' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const item = within(screen.getByRole('menu')).getByRole('menuitem', { name: /^Roster/ });
    expect(item).toHaveTextContent('Roster1');
    await userEvent.click(item);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('list', { name: 'Players' })).toBeInTheDocument();
    // No unbound names: no bubble.
    rerenderWith(rerender, client, snap(true, [ROSTER[1]]));
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Roster' })).toHaveTextContent(/^Roster$/);
  });

  it('guests get no Roster item', async () => {
    setup(snap(false));
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(within(screen.getByRole('menu')).queryByRole('menuitem', { name: /Roster/ })).toBeNull();
  });

  it('autocomplete: players, bound names (wearing their player), unbound names; the add row from 2 characters', async () => {
    setup(snap(true));
    const input = screen.getByLabelText('Task');
    await userEvent.type(input, '@');
    let rows = within(screen.getByRole('listbox', { name: 'Mentions' })).getAllByRole('option');
    expect(rows.map((r) => r.getAttribute('data-kind'))).toEqual(['player', 'player', 'bound', 'unbound', 'keyword', 'keyword']);
    // Bo wears Cody's avatar (Cody is seat 2: blue).
    const cody = rows[0].querySelector('[class*="avatar"]') as HTMLElement;
    const bo = rows[2].querySelector('[class*="avatar"]') as HTMLElement;
    expect(bo).toHaveTextContent('C');
    expect(bo.style.background).toBe(cody.style.background);
    expect(rows[3].querySelector('[class*="dashed"]')).not.toBeNull();
    await userEvent.type(input, 'J');
    rows = within(screen.getByRole('listbox', { name: 'Mentions' })).getAllByRole('option');
    expect(rows.map((r) => [r.textContent, r.getAttribute('data-kind')])).toEqual([['J@Jessie', 'player'], ['@Jess', 'unbound']]);
    await userEvent.type(input, 'ay');
    const add = within(screen.getByRole('listbox', { name: 'Mentions' })).getByRole('option');
    expect(add).toHaveAttribute('data-kind', 'add');
    expect(add).toHaveTextContent(/^Jay$/);
    await userEvent.click(within(add).getByRole('button'));
    expect(input).toHaveValue('@Jay ');
  });

  it('never offers a name bound to yourself', async () => {
    setup(snap(true, [{ key: 'boss', display: 'Boss', seatId: 's1' }, ROSTER[1]]));
    const input = screen.getByLabelText('Task');
    await userEvent.type(input, '@B');
    expect(within(screen.getByRole('listbox', { name: 'Mentions' })).getAllByRole('option').map((r) => r.textContent)).toEqual(['C@Bo']);
    await userEvent.type(input, 'oss');
    expect(screen.queryByRole('listbox', { name: 'Mentions' })).toBeNull();
  });

  it('Enter on the add row sends the task as typed instead of picking', async () => {
    const { client } = setup(snap(true));
    const input = screen.getByLabelText('Task');
    await userEvent.type(input, '@Jay');
    expect(within(screen.getByRole('listbox', { name: 'Mentions' })).getByRole('option')).toHaveAttribute('data-kind', 'add');
    await userEvent.keyboard('{Enter}');
    expect(client.calls).toContainEqual(['addTask', 'g1', '@Jay', expect.any(String)]);
  });

  it('Enter on a player row still picks it', async () => {
    const { client } = setup(snap(true));
    const input = screen.getByLabelText('Task');
    await userEvent.type(input, '@Jessi{Enter}');
    expect(input).toHaveValue('@Jessie ');
    expect(client.calls.some((c) => c[0] === 'addTask')).toBe(false);
  });

  it('Launch with unbound names asks first, showing them as dashed chips; Launch confirms', async () => {
    const s = snap(true);
    const { client } = setup(s);
    const sheet = within(screen.getByTestId('lobby-sheet'));
    await userEvent.click(sheet.getByRole('button', { name: 'Launch' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Launch?' }));
    expect(dialog.getByText('Jess').closest('li')).toHaveClass('chip');
    expect(dialog.queryByText('Bo')).toBeNull();
    expect(client.calls.some((c) => c[0] === 'launch')).toBe(false);
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(client.calls.some((c) => c[0] === 'launch')).toBe(false);
    await userEvent.click(sheet.getByRole('button', { name: 'Launch' }));
    const launch = within(screen.getByRole('dialog', { name: 'Launch?' })).getByRole('button', { name: 'Launch' });
    expect(launch).toHaveClass('dark');
    await userEvent.click(launch);
    expect(client.calls).toContainEqual(['launch', 'g1']);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Launch without unbound names fires at once', async () => {
    const { client } = setup(snap(true, [ROSTER[1]]));
    await userEvent.click(within(screen.getByTestId('lobby-sheet')).getByRole('button', { name: 'Launch' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(client.calls).toContainEqual(['launch', 'g1']);
  });
});
