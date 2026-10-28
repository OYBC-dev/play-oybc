/**
 * Emergency host transfer against the DEPLOYED Worker, for when the host's phone is lost.
 *
 * Usage:
 *   pnpm --filter scripts forceHost <JOINCODE>            lists seats (seatId, name, occupied, host)
 *   pnpm --filter scripts forceHost <JOINCODE> <seatId>   makes that seat the host
 *
 * Credentials: PLAY_ADMIN_TOKEN env, else `.setup-secrets/ADMIN_TOKEN`. Base URL: PLAY_API_URL.
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_API_URL } from './wsClient.ts';

const base = process.env.PLAY_API_URL ?? DEFAULT_API_URL;

/** Reads the admin token from env or the gitignored secrets file. @throws Error when neither exists. */
function adminToken(): string {
  const fromEnv = process.env.PLAY_ADMIN_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  try {
    return readFileSync(new URL('../.setup-secrets/ADMIN_TOKEN', import.meta.url), 'utf8').trim();
  } catch {
    throw new Error('no admin token: set PLAY_ADMIN_TOKEN or create .setup-secrets/ADMIN_TOKEN');
  }
}

/** Lists seats or transfers the host seat. @throws Error on a non-2xx admin response. */
async function main(): Promise<void> {
  const [rawCode, seatId] = process.argv.slice(2);
  if (!rawCode) throw new Error('usage: forceHost <JOINCODE> [seatId]');
  const code = rawCode.trim().toUpperCase();
  const headers = { Authorization: `Bearer ${adminToken()}`, 'Content-Type': 'application/json' };
  if (!seatId) {
    const r = await fetch(`${base}/admin/${code}/seats`, { headers });
    if (!r.ok) throw new Error(`seats failed: ${r.status} ${await r.text()}`);
    console.log(JSON.stringify(await r.json(), null, 2));
    return;
  }
  const r = await fetch(`${base}/admin/${code}/transferHost`, { method: 'POST', headers, body: JSON.stringify({ seatId }) });
  if (!r.ok) throw new Error(`transferHost failed: ${r.status} ${await r.text()}`);
  console.log(`code ${code}: host transferred to ${seatId}`, await r.text());
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
