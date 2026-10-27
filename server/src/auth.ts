import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';
import { AppError } from './errors';
import type { Env } from './index';

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const DAY_SECONDS = 24 * 60 * 60;

// Cached at module scope so Google's signing keys are fetched once per isolate, not per token.
const jwks = createRemoteJWKSet(new URL(JWKS_URL), { cacheMaxAge: DAY_SECONDS * 1000 });

/**
 * Verifies a Firebase ID token and returns its uid.
 * `firebase` mode checks the RS256 signature, issuer and audience; `emulator` mode (local/tests only)
 * trusts the unsigned emulator token and checks only audience and issuer.
 * @throws AppError `unauthenticated` on any failure.
 */
export async function verifyIdToken(token: string, env: Env): Promise<{ uid: string }> {
  const issuer = `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`;
  try {
    if (env.AUTH_MODE === 'emulator') {
      const p = decodeJwt(token);
      const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
      if (!aud.includes(env.FIREBASE_PROJECT_ID) || p.iss !== issuer || !p.sub) throw new Error('claims');
      return { uid: p.sub };
    }
    const { payload } = await jwtVerify(token, jwks, {
      issuer, audience: env.FIREBASE_PROJECT_ID, algorithms: ['RS256'],
    });
    if (!payload.sub) throw new Error('no-sub');
    return { uid: payload.sub };
  } catch {
    throw new AppError('unauthenticated');
  }
}
