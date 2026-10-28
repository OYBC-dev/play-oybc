import { createRemoteJWKSet, decodeJwt, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { AppError } from './errors';
import type { Env } from './index';

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const DAY_SECONDS = 24 * 60 * 60;

// Cached at module scope so Google's signing keys are fetched once per isolate, not per token.
const jwks = createRemoteJWKSet(new URL(JWKS_URL), { cacheMaxAge: DAY_SECONDS * 1000 });

/**
 * True when `e` means Google's signing keys could not be fetched right now (a timeout, a network error,
 * a non-200 or malformed key set) rather than that the token is bad. A token whose `kid` matches no key
 * (`JWKSNoMatchingKey`) is a bad token: jose has already refetched the key set before saying so.
 */
export function isTransientKeyFailure(e: unknown): boolean {
  if (e instanceof errors.JWKSTimeout || e instanceof errors.JWKSInvalid) return true;
  if (e instanceof errors.JOSEError) return e.code === 'ERR_JOSE_GENERIC' && e.message.startsWith('Expected 200 OK');
  return e instanceof TypeError; // fetch() rejects with a TypeError on a network failure
}

/**
 * Verifies a Firebase ID token and returns its uid.
 * `firebase` mode checks the RS256 signature, issuer and audience; `emulator` mode (local/tests only)
 * trusts the unsigned emulator token, checks only audience and issuer, and refuses any project id that
 * is not a `demo-` project (so a misconfigured deploy can never accept unsigned tokens for a real project).
 * @param keys Signing-key lookup; defaults to Google's JWKS (tests inject a stub).
 * @throws AppError `try-again` when the signing keys could not be fetched; `unauthenticated` on any other failure.
 */
export async function verifyIdToken(token: string, env: Env, keys: JWTVerifyGetKey = jwks): Promise<{ uid: string }> {
  const issuer = `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`;
  try {
    if (env.AUTH_MODE === 'emulator') {
      if (!env.FIREBASE_PROJECT_ID.startsWith('demo-')) throw new Error('emulator-mode-needs-demo-project');
      const p = decodeJwt(token);
      const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
      if (!aud.includes(env.FIREBASE_PROJECT_ID) || p.iss !== issuer || !p.sub) throw new Error('claims');
      return { uid: p.sub };
    }
    const { payload } = await jwtVerify(token, keys, {
      issuer, audience: env.FIREBASE_PROJECT_ID, algorithms: ['RS256'],
    });
    if (!payload.sub) throw new Error('no-sub');
    return { uid: payload.sub };
  } catch (e) {
    if (isTransientKeyFailure(e)) throw new AppError('try-again');
    throw new AppError('unauthenticated');
  }
}
