import { buildPoolView, shortfalls } from 'game-core';
import type { Section, StateMsg } from '../protocol';
import type { GameState } from './state';

/** Every snapshot section, in wire order. */
export const ALL_SECTIONS: readonly Section[] = ['game', 'seats', 'view', 'board', 'bingos', 'reclaims'];

/**
 * Builds the requested sections of a state push as one seat sees them.
 * Reclaims are host-only; `seatId` null (a spectator) gets an empty view, no board and no reclaims.
 * Sections the game cannot yet supply (no game row) are omitted for `game`.
 */
export function buildSections(state: GameState, seatId: string | null, sections: readonly Section[]): Partial<StateMsg> {
  const out: Partial<StateMsg> = {};
  for (const section of sections) {
    switch (section) {
      case 'game': {
        const g = state.game;
        if (!g) break;
        const { gameId: _gameId, rev: _rev, lastMutationAt: _last, ...rest } = g;
        out.game = { ...rest, shortfalls: shortfalls(state.poolTasks(), state.seatList()) };
        break;
      }
      case 'seats':
        out.seats = [...state.seats.values()]
          .sort((a, b) => a.joinedAt - b.joinedAt || a.seatId.localeCompare(b.seatId))
          .map(({ seatId: id, name, nameKey, joinedAt }) => ({ seatId: id, name, nameKey, joinedAt }));
        break;
      case 'view':
        out.view = seatId === null ? [] : buildPoolView(state.poolTasks(), state.seatList(), seatId);
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
