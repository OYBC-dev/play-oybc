import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RosterName } from 'game-core';
import type { GameSnapshot } from '../../game/GameClient';
import { appError, FakeGameClient } from '../../game/fakeGameClient';
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

describe('roster in the lobby', () => {
  it('host: an unbound name is a dashed chip button, a bound name a tag button inside its player', async () => {
    setup(snap(true));
    const players = await openPlayers();
    expect(players.getAllByRole('listitem')).toHaveLength(4);
    const jess = players.getByRole('button', { name: 'Jess' });
    expect(jess).toHaveClass('dashed');
    const bo = players.getByRole('button', { name: 'Bo' });
    expect(bo).toHaveClass('tag');
    expect(bo.closest('li')).toHaveTextContent('CodyBo');
  });

  it('guest: the dashed chip and the tag are static', async () => {
    setup(snap(false));
    const players = await openPlayers();
    expect(players.queryByRole('button')).toBeNull();
    expect(players.getByText('Jess').closest('[class*="dashed"]')).not.toBeNull();
    expect(players.getByText('Bo').closest('li')).toHaveTextContent('CodyHostBo');
  });

  it('picking a player binds at once and the sheet stays open; Nobody yet unbinds; Done closes', async () => {
    const { client, rerender } = setup(snap(true));
    const players = await openPlayers();
    await userEvent.click(players.getByRole('button', { name: 'Jess' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Jess' }));
    expect(dialog.getByRole('radio', { name: 'Nobody yet' })).toHaveAttribute('aria-checked', 'true');
    expect(dialog.getAllByRole('radio').map((r) => r.textContent)).toEqual(['Me', 'Cody', 'Jessie', 'Nobody yet']);
    await userEvent.click(dialog.getByRole('radio', { name: 'Jessie' }));
    expect(client.calls).toContainEqual(['bindName', 'g1', 'jess', 's3']);
    rerender(<LobbyScreen client={client} snapshot={snap(true, [{ key: 'jess', display: 'Jess', seatId: 's3' }, ROSTER[1]])} gameId="g1" onLeave={() => {}} />);
    expect(dialog.getByRole('radio', { name: 'Jessie' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(dialog.getByRole('radio', { name: 'Nobody yet' }));
    expect(client.calls).toContainEqual(['bindName', 'g1', 'jess', null]);
    await userEvent.click(dialog.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a bound tag opens the sheet on its player', async () => {
    setup(snap(true));
    const players = await openPlayers();
    await userEvent.click(players.getByRole('button', { name: 'Bo' }));
    expect(within(screen.getByRole('dialog', { name: 'Bo' })).getByRole('radio', { name: 'Cody' })).toHaveAttribute('aria-checked', 'true');
  });

  it('a failed bind shows the error and keeps the old selection', async () => {
    const { client } = setup(snap(true));
    client.bindResult = appError('seat-not-found');
    const players = await openPlayers();
    await userEvent.click(players.getByRole('button', { name: 'Jess' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Jess' }));
    await userEvent.click(dialog.getByRole('radio', { name: 'Cody' }));
    expect(dialog.getByRole('alert')).toHaveTextContent('That player left');
    expect(dialog.getByRole('radio', { name: 'Nobody yet' })).toHaveAttribute('aria-checked', 'true');
  });

  it('Not coming asks first, then retires the name and closes', async () => {
    const { client, rerender } = setup(snap(true));
    const players = await openPlayers();
    await userEvent.click(players.getByRole('button', { name: 'Jess' }));
    await userEvent.click(screen.getByRole('button', { name: 'Not coming' }));
    const confirm = within(screen.getByRole('dialog', { name: 'Not coming?' }));
    await userEvent.click(confirm.getByRole('button', { name: 'Cancel' }));
    expect(client.calls.some((c) => c[0] === 'retireName')).toBe(false);
    expect(screen.getByRole('dialog', { name: 'Jess' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Not coming' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Not coming?' })).getByRole('button', { name: 'Remove' }));
    expect(client.calls).toContainEqual(['retireName', 'g1', 'jess']);
    expect(screen.queryByRole('dialog')).toBeNull();
    // The name leaves the roster: its chip goes.
    await act(async () => {
      rerender(<LobbyScreen client={client} snapshot={snap(true, [ROSTER[1]])} gameId="g1" onLeave={() => {}} />);
    });
    expect(within(screen.getByRole('list', { name: 'Players' })).queryByText('Jess')).toBeNull();
  });

  it('autocomplete lists roster names after players and offers to add a new name', async () => {
    setup(snap(true));
    const input = screen.getByLabelText('Task');
    await userEvent.type(input, '@J');
    const rows = within(screen.getByRole('listbox', { name: 'Mentions' })).getAllByRole('option');
    expect(rows.map((r) => [r.textContent, r.getAttribute('data-kind')])).toEqual([['@Jessie', 'player'], ['@Jess', 'unbound']]);
    await userEvent.type(input, 'ay');
    const add = within(screen.getByRole('listbox', { name: 'Mentions' })).getByRole('option');
    expect(add).toHaveAttribute('data-kind', 'add');
    expect(add).toHaveTextContent('+Jay');
    await userEvent.keyboard('{Enter}');
    expect(input).toHaveValue('@Jay ');
  });
});
