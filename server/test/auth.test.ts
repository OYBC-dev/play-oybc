import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { verifyIdToken } from '../src/auth';
import { AppError } from '../src/errors';

const b64url = (o: unknown): string => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** An unsigned JWT: base64url header + payload and an empty signature. */
function unsignedJwt(payload: Record<string, unknown>): string {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.`;
}

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
