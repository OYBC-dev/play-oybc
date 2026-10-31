import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GameSnapshot } from '../../game/GameClient';
import { FakeGameClient } from '../../game/fakeGameClient';
import { hasSeenHowTo, HOW_TO_SEEN_KEY, markHowToSeen, shouldAutoOpenHowTo } from './howTo';
import { LobbyScreen } from './LobbyScreen';

function snap({ mine = false, stage = 'lobby' as const }: { mine?: boolean; stage?: 'lobby' } = {}): GameSnapshot {
  return {
    game: { code: 'ABCDE', stage, hostSeatId: 's2', createdAt: 0, bingoCount: 0, shortfalls: { s1: 25 }, reviewGate: false },
    mySeatId: 's1',
    seats: [
      { seatId: 's1', name: 'Cody', nameKey: 'cody', joinedAt: 2 },
      { seatId: 's2', name: 'Stephen', nameKey: 'stephen', joinedAt: 1 },
    ],
    view: mine ? [{ taskId: 't1', authorName: 'Cody', text: 'Mine', mine: true }] : [],
    board: null, bingos: [], standings: [], reclaims: [], roster: [],
  };
}

const lobby = (s: GameSnapshot) => render(<LobbyScreen client={new FakeGameClient()} snapshot={s} gameId="g1" onLeave={() => {}} />);

describe('How tasks work gating', () => {
  it('opens on its own only when unseen, in the lobby, with no tasks of ours', () => {
    expect(shouldAutoOpenHowTo({ seen: false, stage: 'lobby', authored: 0 })).toBe(true);
    expect(shouldAutoOpenHowTo({ seen: true, stage: 'lobby', authored: 0 })).toBe(false);
    expect(shouldAutoOpenHowTo({ seen: false, stage: 'playing', authored: 0 })).toBe(false);
    expect(shouldAutoOpenHowTo({ seen: false, stage: 'lobby', authored: 2 })).toBe(false);
  });

  it('the key: unset reads unseen, markHowToSeen sets it, and storage that throws reads unseen without crashing', () => {
    expect(hasSeenHowTo()).toBe(false);
    markHowToSeen();
    expect(localStorage.getItem(HOW_TO_SEEN_KEY)).toBe('1');
    expect(hasSeenHowTo()).toBe(true);
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    try {
      expect(hasSeenHowTo()).toBe(false);
      expect(() => markHowToSeen()).not.toThrow();
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });
});

describe('How tasks work dialog in the lobby', () => {
  it('first join: opens by itself with Welcome, {name}; the four kinds; dismissing sets the key and focuses the composer', async () => {
    lobby(snap());
    const dialog = screen.getByRole('dialog', { name: 'Four kinds of task' });
    expect(dialog).toHaveTextContent('Welcome, Cody');
    const kinds = screen.getAllByRole('listitem').filter((li) => li.closest('[role="dialog"]') === dialog);
    expect(kinds.map((k) => k.textContent)).toEqual([
      'PlainSeen byEveryoneDealt toEveryone',
      '@NameSeen byEveryone except NameDealt toEveryone except Name',
      '@someoneSeen byOnly youDealt toA random player on each board',
      '@anyoneSeen byOnly youDealt toOne board · counts when anyone but its owner does it',
    ]);
    expect(dialog.querySelectorAll('em')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: "Got it, let's add some" }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem(HOW_TO_SEEN_KEY)).toBe('1');
    expect(screen.getByLabelText('Task')).toHaveFocus();
  });

  it('does not open by itself once seen, nor for a seat that already has tasks in the pool', () => {
    localStorage.setItem(HOW_TO_SEEN_KEY, '1');
    const { unmount } = lobby(snap());
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();
    localStorage.clear();
    lobby(snap({ mine: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Escape dismisses the first-join dialog and sets the key too', async () => {
    lobby(snap());
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(hasSeenHowTo()).toBe(true);
  });

  it('the (i) bubble beside Add reopens it with the Pool kicker and Done; focus returns to the bubble', async () => {
    localStorage.setItem(HOW_TO_SEEN_KEY, '1');
    lobby(snap({ mine: true }));
    const bubble = screen.getByRole('button', { name: 'How tasks work' });
    expect(bubble.previousElementSibling).toHaveTextContent('Add');
    await userEvent.click(bubble);
    const dialog = screen.getByRole('dialog', { name: 'Four kinds of task' });
    expect(dialog).toHaveTextContent(/^Pool/);
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(bubble).toHaveFocus();
  });
});
