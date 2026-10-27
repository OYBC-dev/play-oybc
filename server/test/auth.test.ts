import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { errors } from 'jose';
import { verifyIdToken } from '../src/auth';
import { AppError } from '../src/errors';
import { unsignedJwt } from './helpers';

describe('verifyIdToken', () => {
  it('emulator mode accepts an unsigned token with the right aud/iss', async () => {
    const token = unsignedJwt({ sub: 'u1', aud: 'demo-play-oybc', iss: 'https://securetoken.google.com/demo-play-oybc' });
    expect(await verifyIdToken(token, env)).toEqual({ uid: 'u1' });
  });

  it('emulator mode rejects a wrong audience', async () => {
    const token = unsignedJwt({ sub: 'u1', aud: 'other', iss: 'https://securetoken.google.com/demo-play-oybc' });
    await expect(verifyIdToken(token, env)).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(verifyIdToken(token, env)).rejects.toBeInstanceOf(AppError);
  });

  it('emulator mode rejects a wrong issuer, a missing sub and garbage', async () => {
    const badIss = unsignedJwt({ sub: 'u1', aud: 'demo-play-oybc', iss: 'https://evil.example' });
    const noSub = unsignedJwt({ aud: 'demo-play-oybc', iss: 'https://securetoken.google.com/demo-play-oybc' });
    for (const t of [badIss, noSub, 'not-a-jwt']) {
      await expect(verifyIdToken(t, env)).rejects.toMatchObject({ code: 'unauthenticated' });
    }
  });

  it('emulator mode refuses a project id that is not demo-', async () => {
    const token = unsignedJwt({ sub: 'u1', aud: 'play-oybc', iss: 'https://securetoken.google.com/play-oybc' });
    await expect(verifyIdToken(token, { ...env, FIREBASE_PROJECT_ID: 'play-oybc' })).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('firebase mode: an unreachable key set is try-again; a key mismatch or bad token is unauthenticated', async () => {
    const fb = { ...env, AUTH_MODE: 'firebase' as const };
    const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    const rs256 = `${b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' })}.${b64({ sub: 'u1' })}.AAAA`;
    const failing = (e: Error) => async () => { throw e; };
    for (const e of [new TypeError('fetch failed'), new errors.JWKSTimeout(), new errors.JWKSInvalid('bad'),
      new errors.JOSEError('Expected 200 OK from the JSON Web Key Set HTTP response')]) {
      await expect(verifyIdToken(rs256, fb, failing(e))).rejects.toMatchObject({ code: 'try-again' });
    }
    for (const e of [new errors.JWKSNoMatchingKey(), new Error('anything else')]) {
      await expect(verifyIdToken(rs256, fb, failing(e))).rejects.toMatchObject({ code: 'unauthenticated' });
    }
  });

  it('firebase mode rejects an unsigned token', async () => {
    const token = unsignedJwt({ sub: 'u1', aud: 'demo-play-oybc', iss: 'https://securetoken.google.com/demo-play-oybc' });
    await expect(verifyIdToken(token, { ...env, AUTH_MODE: 'firebase' })).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});

describe('worker routes', () => {
  it('GET /health answers ok', async () => {
    const r = await SELF.fetch('http://x/health');
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('ok');
  });

  it('unknown paths are 404', async () => {
    expect((await SELF.fetch('http://x/nope')).status).toBe(404);
  });
});
