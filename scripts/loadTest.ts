/**
 * Load check against the DEPLOYED Worker: 20 anonymous seats join one game over WebSockets, add 60 tasks
 * concurrently, the host launches, then 200 `mark` actions fire across seats (all seats at once, each seat's
 * taps in sequence) with 5 seats forced to complete row 0. Failures are counted and reported, never retried.
 *
 * Usage: node --experimental-strip-types scripts/loadTest.ts   (reads web/.env.local; PLAY_API_URL overrides the Worker)
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { connect, DEFAULT_API_URL, sleep, type Ack, type WsClient } from './wsClient.ts';

const BASE = process.env.PLAY_API_URL ?? DEFAULT_API_URL;
const SEATS = 20;
const TASKS = 60;
const MARKS = 200;
const PACE_MS = 70; // per-socket act limit is 20/s burst 40

const env: Record<string, string> = {};
for (const line of readFileSync(new URL('../web/.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

interface Player { name: string; token: string; client?: WsClient; seatId: string }

const failures: Record<string, number> = {};
const errorSamples: string[] = [];
const latencies: Record<string, number[]> = {};
let ok = 0;
let failed = 0;

/** Times `fn`; a thrown error or `ok:false` ack counts as a failure (never retried). */
async function timed<T extends Ack | unknown>(label: string, fn: () => Promise<T>): Promise<T | null> {
  const t0 = performance.now();
  const fail = (what: string) => {
    failed++;
    const key = `${label}: ${what}`;
    failures[key] = (failures[key] ?? 0) + 1;
    if (errorSamples.length < 5) errorSamples.push(key);
    return null;
  };
  try {
    const r = await fn();
    if (r && typeof r === 'object' && 'ok' in r && (r as Ack).ok === false) return fail((r as { code: string }).code);
    (latencies[label] ??= []).push(performance.now() - t0);
    ok++;
    return r;
  } catch (e) {
    return fail((e as Error).message);
  }
}

/** Signs in anonymously on a private Firebase app and returns the player with a fresh ID token. */
async function makePlayer(i: number): Promise<Player> {
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID,
  }, `p${i}`);
  const cred = await signInAnonymously(getAuth(app));
  return { name: `Load ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? 'x' : ''}`, token: await cred.user.getIdToken(), seatId: '' };
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]) : NaN;
};

const players = await Promise.all(Array.from({ length: SEATS }, (_, i) => makePlayer(i)));
const host = players[0];

const created = await timed('createGame', async () => {
  const r = await fetch(`${BASE}/api/createGame`, {
    method: 'POST', headers: { Authorization: `Bearer ${host.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: host.name }),
  });
  if (!r.ok) throw new Error(`http ${r.status}`);
  return (await r.json()) as { gameId: string; code: string; seatId: string };
});
if (!created) { console.error('createGame failed', failures); process.exit(1); }
const { gameId, code } = created;
host.seatId = created.seatId;
console.log(`game ${gameId} code ${code}`);

// One socket per seat, connected once (the Worker rate-limits upgrades per IP).
await Promise.all(players.map(async (p, i) => {
  p.client = (await timed('connect', () => connect(BASE, code, p.token, i === 0 ? gameId : undefined))) ?? undefined;
}));
await Promise.all(players.slice(1).map(async (p) => {
  if (!p.client) return;
  const r = await timed('join', () => p.client!.act('join', { name: p.name }));
  if (r && r.ok) p.seatId = (r.result as { seatId: string }).seatId;
}));
const seated = players.filter((p) => p.client && p.seatId);

await Promise.all(Array.from({ length: TASKS }, (_, i) =>
  timed('addTask', () => seated[i % seated.length].client!.act('addTask', { taskId: randomUUID(), text: `Load task ${i + 1}` }))));

const launched = await timed('launch', () => host.client!.act('launch', {}));
if (!launched) console.error('launch failed', failures);

const rand = (n: number) => Math.floor(Math.random() * n);
const BINGO_SEATS = 5;
const bingoPlayers = seated.slice(0, BINGO_SEATS);
const bingoSet = new Set(bingoPlayers);
const forced = bingoPlayers.flatMap((p) => [0, 1, 2, 3, 4].map((cell) => ({ p, cell })));
const randomPlan = Array.from({ length: MARKS - forced.length }, () => {
  const p = seated[rand(seated.length)];
  // Never touch a bingo seat's row 0, so a random mark can't un-mark it.
  const cell = bingoSet.has(p) ? 5 + rand(20) : rand(25);
  return { p, cell };
});
const plan = [...forced, ...randomPlan].sort(() => Math.random() - 0.5);
const bySeat = new Map<Player, number[]>();
for (const { p, cell } of plan) bySeat.set(p, [...(bySeat.get(p) ?? []), cell]);
// Every seat plays at once, each seat's taps in sequence and paced under the per-socket act limit.
// Forced row-0 cells must be marked (not toggled off), so send explicit marked:true for them.
await Promise.all([...bySeat].map(async ([p, cells]) => {
  for (const cell of cells) {
    const forcedCell = bingoSet.has(p) && cell < 5;
    await timed('mark', () => p.client!.act('mark', forcedCell ? { cellIndex: cell, marked: true } : { cellIndex: cell }));
    await sleep(PACE_MS);
  }
}));

// End the game, then read bingos from a fresh hello (full state) as the host.
await timed('end', () => host.client!.act('end', {}));
await sleep(500);
const fresh = await connect(BASE, code, host.token, gameId);
const bingoCount = fresh.latest.game?.bingoCount as number;
const bingos = (fresh.latest.bingos ?? []) as Array<{ seq: number }>;
const seqs = bingos.map((b) => b.seq).sort((a, b) => a - b);
const gaps = seqs.some((s, i) => s !== i + 1) || (seqs.length > 0 && seqs[seqs.length - 1] !== bingoCount);
fresh.close();
for (const p of players) p.client?.close();

console.log('---');
console.log(`calls ok=${ok} failed=${failed}`);
for (const [k, v] of Object.entries(failures)) console.log(`  FAIL x${v}: ${k}`);
errorSamples.forEach((s) => console.log(`  sample: ${s}`));
for (const [k, xs] of Object.entries(latencies)) console.log(`${k}: n=${xs.length} p50=${pct(xs, 0.5)}ms p95=${pct(xs, 0.95)}ms`);
console.log(`bingoCount=${bingoCount} bingos=${bingos.length} seqs=${seqs.length ? `${seqs[0]}..${seqs[seqs.length - 1]}` : 'none'} gaps=${gaps}`);
const p50 = pct(latencies.mark ?? [], 0.5);
const pass = failed === 0 && bingoCount >= BINGO_SEATS && bingoCount === bingos.length && !gaps && p50 < 150;
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
