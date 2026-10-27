import type { AckMsg } from './protocol';

/** Every error code a client may read (`details.code` on web, `AppError.code` on iOS). */
export type AppErrorCode =
  | 'invalid-name' | 'invalid-text' | 'game-not-found' | 'game-ended' | 'unknown-mention'
  | 'self-mention' | 'not-host' | 'wrong-stage' | 'not-ready' | 'invalid-cell'
  | 'unknown-seat' | 'reclaim-not-found' | 'reclaim-cooldown'
  | 'unauthenticated' | 'permission-denied' | 'not-found' | 'invalid-argument' | 'resource-exhausted';

/** A failure with a client-visible code; its message is the code and never carries internals. */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: Record<string, unknown>;

  /**
   * @param code Client-visible error code.
   * @param details Optional structured context returned to the client.
   */
  constructor(code: AppErrorCode, details?: Record<string, unknown>) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
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
