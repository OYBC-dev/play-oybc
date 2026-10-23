const MESSAGES: Record<string, string> = {
  'invalid-name': 'Use 1–20 letters, numbers or spaces',
  'game-not-found': 'No game with that code',
  'game-ended': 'That game has ended',
  'reclaim-not-found': 'That request is gone',
  'unknown-mention': 'No one here goes by that name',
  'self-mention': "You can't mention yourself",
  'not-host': 'Only the host can do that',
  'wrong-stage': "That isn't available right now",
  'not-ready': 'Not everyone has enough tasks yet',
  'invalid-cell': 'That square is not available',
  'unknown-seat': 'That player is not in this game',
  'invalid-text': 'Task text is empty or too long',
};

const FALLBACK = 'Something went wrong';

/** The app error code a callable failure carries (`error.details.code`), if any. */
export function appErrorCode(e: unknown): string | null {
  const details = (e as { details?: { code?: unknown } } | null)?.details;
  return typeof details?.code === 'string' ? details.code : null;
}

/** User-facing copy for any error thrown by a callable. */
export function errorMessage(e: unknown): string {
  const code = appErrorCode(e);
  if (code === 'unknown-mention') {
    const token = (e as { details?: { token?: unknown } }).details?.token;
    if (typeof token === 'string' && token) return `No player named ${token}`;
  }
  return (code && MESSAGES[code]) || FALLBACK;
}
