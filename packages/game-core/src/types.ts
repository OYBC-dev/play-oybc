/** A player's seat in a session. */
export interface Seat { seatId: string; name: string; joinedAt: number }
/**
 * Who a task text @-mentions. `seatIds` are the seats matched when the task was
 * written; `names` are the `nameKey`s of `@Name` tokens that matched nobody then
 * (absent = none). Both are authoring-time records: visibility and dealing
 * re-scan the text against the current seats (see `visibility.ts`).
 */
export interface TaskMentions { seatIds: string[]; someone: boolean; anyone: boolean; names?: string[] }
/** What the host has said about a referenced name: who it is (`seatId`, null = nobody yet) or that they are not coming (`retired`). */
export interface NameState { seatId: string | null; retired: boolean }
/** Name states by key. A key with no entry is unbound. */
export type NameStates = ReadonlyMap<string, NameState>;
/** A name tasks refer to that no seat carries as its own; `seatId` is the host's binding (null = nobody yet). */
export interface RosterName { key: string; display: string; seatId: string | null }
/** A task in the shared pool. */
export interface PoolTask { id: string; text: string; authorSeatId: string; mentions: TaskMentions; createdAt: number }
/**
 * What a given viewer sees of a pool task: `text` is the display text (mentions
 * resolved, `@someone` shown as "Someone"), or null when hidden. `refs` are the
 * resolved mentions' offsets in `text` (absent = none).
 */
export interface PoolViewEntry { taskId: string; authorName: string; text: string | null; refs?: Array<[number, number]>; mine: boolean }
/** One player's row on the leaderboard (see `standings`). */
export interface Standing {
  seatId: string;
  name: string;
  bingos: number;
  marked: number;
  bestLine: number;
  firstBingoSeq: number | null;
}
