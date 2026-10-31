import type { GameSnapshot } from '../../game/GameClient';
import {
  authoredCount, isPoolReady, launchLabel, playerRows, playerWaitingCopy, readinessSummary, tasksStillNeeded,
} from './lobbyReadiness';

/** The handoff fixtures: host Stephen, players Cody, Pat, Mary Jane; shortfalls Cody 3, Mary Jane 2, Pat 1; pool 18 / 25. */
function fixture(over: { shortfalls?: Record<string, number>; me?: string; mine?: number; stage?: 'lobby' | 'playing' } = {}): GameSnapshot {
  const view = Array.from({ length: 18 }, (_, i) => ({ taskId: `t${i}`, authorName: 'X', text: `t${i}`, mine: i < (over.mine ?? 0) }));
  return {
    game: {
      code: 'HX7KQ', stage: over.stage ?? 'lobby', hostSeatId: 'stephen', createdAt: 0, bingoCount: 0, reviewGate: false,
      shortfalls: over.shortfalls ?? { cody: 3, mj: 2, pat: 1 },
      tasksPerBoard: 25,
      dealable: { stephen: 25, cody: 22, pat: 24, mj: 23 },
    },
    mySeatId: over.me ?? 'stephen',
    seats: [
      { seatId: 'stephen', name: 'Stephen', nameKey: 'stephen', joinedAt: 1 },
      { seatId: 'cody', name: 'Cody', nameKey: 'cody', joinedAt: 2 },
      { seatId: 'pat', name: 'Pat', nameKey: 'pat', joinedAt: 3 },
      { seatId: 'mj', name: 'Mary Jane', nameKey: 'mary jane', joinedAt: 4 },
    ],
    view, board: null, bingos: [], standings: [], reclaims: [], roster: [],
  };
}

describe('lobby readiness', () => {
  it('ready = lobby with no shortfall; zero entries count as none', () => {
    expect(isPoolReady(fixture())).toBe(false);
    expect(isPoolReady(fixture({ shortfalls: {} }))).toBe(true);
    expect(isPoolReady(fixture({ shortfalls: { cody: 0 } }))).toBe(true);
    expect(isPoolReady(fixture({ shortfalls: {}, stage: 'playing' }))).toBe(false);
  });

  it('tasks still needed is the largest shortfall', () => {
    expect(tasksStillNeeded(fixture())).toBe(3);
    expect(tasksStillNeeded(fixture({ shortfalls: {} }))).toBe(0);
  });

  it('host summary while filling: have of target, Need n more, one red line per short player (largest first)', () => {
    const s = readinessSummary(fixture(), true);
    expect(s).toMatchObject({ have: 18, target: 25, percent: 72, label: '18 of 25 in the pool', sub: 'Need 3 more' });
    expect(s.lines).toEqual([
      { text: 'Cody needs 3 more', short: true },
      { text: 'Mary Jane needs 2 more', short: true },
      { text: 'Pat needs 1 more', short: true },
    ]);
  });

  it('host summary when ready: Pool is full, Ready to launch, full bar, no lines', () => {
    expect(readinessSummary(fixture({ shortfalls: {} }), true)).toMatchObject({ percent: 100, label: 'Pool is full', sub: 'Ready to launch', lines: [] });
  });

  it('player summary: one line about themselves, counting the tasks they authored', () => {
    const filling = readinessSummary(fixture({ me: 'cody', mine: 3 }), false);
    expect(filling.lines).toEqual([{ text: "You've added 3 · 3 more to go", short: true }]);
    const mineSet = readinessSummary(fixture({ me: 'stephen', mine: 6 }), false);
    expect(mineSet.lines).toEqual([{ text: "You've added 6 · all set", short: false }]);
    const ready = readinessSummary(fixture({ me: 'cody', mine: 6, shortfalls: {} }), false);
    expect(ready.sub).toBe('Waiting on host');
    expect(authoredCount(fixture({ mine: 4 }))).toBe(4);
  });

  it('bar caps at 100% for a pool past the target', () => {
    const s = fixture();
    s.view = Array.from({ length: 40 }, (_, i) => ({ taskId: `x${i}`, authorName: 'X', text: 'x', mine: false }));
    expect(readinessSummary(s, true).percent).toBe(100);
  });

  it('player rows: short first (largest first), then the rest in join order; dealable over tasksPerBoard; Host flagged', () => {
    const rows = playerRows(fixture());
    expect(rows.map((r) => [r.name, r.dealable, r.target, r.short, r.isHost])).toEqual([
      ['Cody', 22, 25, 3, false],
      ['Mary Jane', 23, 25, 2, false],
      ['Pat', 24, 25, 1, false],
      ['Stephen', 25, 25, 0, true],
    ]);
    expect(rows.map((r) => r.index)).toEqual([1, 3, 2, 0]);
  });

  it('player waiting copy is gated on ready; Launch label carries the need', () => {
    expect(playerWaitingCopy(fixture())).toEqual({ label: 'Pool needs 3 more tasks', ready: false });
    expect(playerWaitingCopy(fixture({ shortfalls: { pat: 1 } }))).toEqual({ label: 'Pool needs 1 more task', ready: false });
    expect(playerWaitingCopy(fixture({ shortfalls: {} }))).toEqual({ label: 'Waiting for host to start', ready: true });
    expect(launchLabel(fixture())).toBe('Launch · need 3 more');
    expect(launchLabel(fixture({ shortfalls: {} }))).toBe('Launch');
  });
});
