import { buildPoolView, buildRoster, dealableCounts, mentionContext, shortfallsFromCounts, standings, tasksPerBoard, type MentionContext, type RosterName, type Standing } from 'game-core';
import type { Section, StateMsg } from '../protocol';
import type { GameState } from './state';

/** Every snapshot section, in wire order. */
export const ALL_SECTIONS: readonly Section[] = ['game', 'seats', 'view', 'board', 'bingos', 'standings', 'reclaims', 'roster'];

/**
 * The leaderboard over every dealt board (empty before launch): each seat's announced lines and its first
 * announced bingo's `seq`, ranked by game-core's `standings` under the game's free-space option.
 */
export function buildStandings(state: GameState): Standing[] {
  const firstSeq = new Map<string, number>();
  for (const b of state.bingos) {
    if (b.status !== 'announced') continue;
    const prior = firstSeq.get(b.seatId);
    if (prior === undefined || b.seq < prior) firstSeq.set(b.seatId, b.seq);
  }
  const boards = [...state.boards.values()].map((b) => ({
    seatId: b.seatId, marks: b.marks, announcedLines: b.announcedLines, firstBingoSeq: firstSeq.get(b.seatId) ?? null,
  }));
  return standings(boards, state.seatList(), { freeSpace: state.game?.freeSpace ?? false });
}

/**
 * Work shared across the frames of one push: the pool scanned once (`ctx`) and the seat-independent
 * `game` section built once. Pass a fresh `{}` per push; never reuse one across state changes.
 */
export interface SectionMemo { ctx?: MentionContext; game?: StateMsg['game']; roster?: RosterName[] }

/**
 * Builds the requested sections of a state push as one seat sees them.
 * Reclaims are host-only; `seatId` null (a spectator) gets an empty view, no board and no reclaims.
 * Sections the game cannot yet supply (no game row) are omitted for `game`. The `game` section carries the
 * free-space option, `tasksPerBoard`, and per-seat `shortfalls` / `dealable` computed under that option.
 * `shortfalls` / `dealable` are lobby-time readiness over the whole pool: after launch they ignore the late-join exclusion.
 * @param memo shared across the frames of one push (see {@link SectionMemo})
 */
export function buildSections(state: GameState, seatId: string | null, sections: readonly Section[], memo: SectionMemo = {}): Partial<StateMsg> {
  const out: Partial<StateMsg> = {};
  const ctx = (): MentionContext => (memo.ctx ??= mentionContext(state.poolTasks(), state.seatList(), state.nameStates()));
  for (const section of sections) {
    switch (section) {
      case 'game': {
        const g = state.game;
        if (!g) break;
        if (!memo.game) {
          const { gameId: _gameId, rev: _rev, lastMutationAt: _last, ...rest } = g;
          const opts = { freeSpace: g.freeSpace, names: state.nameStates() };
          const tasks = state.poolTasks();
          const seats = state.seatList();
          const dealable = dealableCounts(tasks, seats, opts, ctx());
          memo.game = {
            ...rest, tasksPerBoard: tasksPerBoard(g.freeSpace),
            shortfalls: shortfallsFromCounts(dealable, tasksPerBoard(g.freeSpace)), dealable,
          };
        }
        out.game = memo.game;
        break;
      }
      case 'standings':
        out.standings = buildStandings(state);
        break;
      case 'roster':
        out.roster = memo.roster ??= buildRoster(state.poolTasks(), state.seatList(), state.nameStates());
        break;
      case 'seats':
        out.seats = [...state.seats.values()]
          .sort((a, b) => a.joinedAt - b.joinedAt || a.seatId.localeCompare(b.seatId))
          .map(({ seatId: id, name, nameKey, joinedAt }) => ({ seatId: id, name, nameKey, joinedAt }));
        break;
      case 'view':
        out.view = seatId === null ? [] : buildPoolView(state.poolTasks(), state.seatList(), seatId, ctx());
        break;
      case 'board': {
        const b = seatId === null ? undefined : state.boards.get(seatId);
        out.board = b ? { cells: b.cells, marks: b.marks, completedLines: b.completedLines, announcedLines: b.announcedLines } : null;
        break;
      }
      case 'bingos':
        out.bingos = state.bingos
          .filter((b) => b.status === 'announced')
          .sort((a, b) => a.seq - b.seq)
          .map(({ id: _id, ...doc }) => doc);
        break;
      case 'reclaims':
        out.reclaims =
          seatId !== null && seatId === state.game?.hostSeatId
            ? [...state.reclaims.values()].filter((r) => r.status === 'pending').sort((a, b) => a.createdAt - b.createdAt)
            : [];
        break;
    }
  }
  return out;
}
