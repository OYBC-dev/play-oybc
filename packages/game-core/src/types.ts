/** A player's seat in a session. */
export interface Seat { seatId: string; name: string; joinedAt: number }
/** Who a task text @-mentions. */
export interface TaskMentions { seatIds: string[]; someone: boolean; anyone: boolean }
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
