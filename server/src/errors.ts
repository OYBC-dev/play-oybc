import type { AckMsg } from './protocol';
import type { Push } from './room/ops';

/** Every error code a client may read (`details.code` on web, `AppError.code` on iOS). */
export type AppErrorCode =
  | 'invalid-name' | 'invalid-text' | 'game-not-found' | 'game-ended'
  | 'self-mention' | 'not-host' | 'wrong-stage' | 'not-ready' | 'invalid-cell'
  | 'unknown-seat' | 'reclaim-not-found' | 'reclaim-cooldown'
  | 'unauthenticated' | 'permission-denied' | 'not-found' | 'invalid-argument' | 'resource-exhausted'
  | 'try-again';

/** A failure with a client-visible code; its message is the code and never carries internals. */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: Record<string, unknown>;
  /** Broadcast the runner must send before the failed ack (state committed before the throw). */
  readonly push?: Push;

  /**
   * @param code Client-visible error code.
   * @param details Optional structured context returned to the client.
   * @param push Optional push for changes committed before the failure.
   */
  constructor(code: AppErrorCode, details?: Record<string, unknown>, push?: Push) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
    this.push = push;
  }
}

/**
 * Builds the failure ack for an action; unknown errors become `code: 'unknown'` and never leak their message.
 * @param id The client's action id.
 * @param e Whatever the handler threw.
 */
export function toAck(id: string, e: unknown): AckMsg {
  if (e instanceof AppError) {
    return e.details
      ? { t: 'ack', id, ok: false, code: e.code, details: e.details }
      : { t: 'ack', id, ok: false, code: e.code };
  }
  return { t: 'ack', id, ok: false, code: 'unknown' };
}
