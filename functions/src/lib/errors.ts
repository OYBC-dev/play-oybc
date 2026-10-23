import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https';

/** App-level error codes carried in HttpsError `details.code`. */
export type AppErrorCode =
  | 'invalid-name' | 'invalid-text' | 'game-not-found' | 'game-ended' | 'unknown-mention'
  | 'self-mention' | 'not-host' | 'wrong-stage' | 'not-ready' | 'invalid-cell' | 'unknown-seat' | 'reclaim-not-found';

/**
 * Builds an HttpsError with a standard Firebase code and an app code in `details.code`.
 * @param httpsCode standard Firebase functions error code
 * @param appCode app error code clients switch on
 * @param message optional human message (defaults to the app code)
 * @param extra optional extra fields merged into `details` (code stays authoritative)
 */
export function appError(httpsCode: FunctionsErrorCode, appCode: AppErrorCode, message?: string, extra?: Record<string, unknown>): HttpsError {
  return new HttpsError(httpsCode, message ?? appCode, { ...extra, code: appCode });
}
