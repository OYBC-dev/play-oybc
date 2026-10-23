/** A player's seat in a session. */
export interface Seat { seatId: string; name: string; joinedAt: number }
/** Who a task text @-mentions. */
export interface TaskMentions { seatIds: string[]; someone: boolean; anyone: boolean }
/** A task in the shared pool. */
export interface PoolTask { id: string; text: string; authorSeatId: string; mentions: TaskMentions; createdAt: number }
/** What a given viewer sees of a pool task; text is null when hidden. */
export interface PoolViewEntry { taskId: string; authorName: string; text: string | null; mine: boolean }
