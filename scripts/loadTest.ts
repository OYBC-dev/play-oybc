/**
 * Load check against the DEPLOYED project: 20 anonymous seats join one game, add 60 tasks
 * concurrently, the host launches, then 200 random toggleMark calls fire across seats.
 * Failures are counted and reported, never retried.
 *
 * Usage: node --experimental-strip-types scripts/loadTest.ts   (reads web/.env.local)
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { collection, getDocs, getFirestore, doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const SEATS = 20;
const TASKS = 60;
const TOGGLES = 200;

const env: Record<string, string> = {};
for (const line of readFileSync(new URL('../web/.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

interface Player { name: string; call: (fn: string, data: unknown) => Promise<any>; db: ReturnType<typeof getFirestore>; seatId: string }

const failures: Record<string, number> = {};
const errorSamples: string[] = [];
const latencies: Record<string, number[]> = {};
let ok = 0;
let failed = 0;

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  const t0 = performance.now();
  try {
    const r = await fn();
    (latencies[label] ??= []).push(performance.now() - t0);
    ok++;
    return r;
  } catch (e) {
    failed++;
    const err = e as { code?: string; message?: string; details?: unknown };
    const key = `${label}: ${err.code ?? 'error'} ${err.message ?? ''}`;
    failures[key] = (failures[key] ?? 0) + 1;
    if (errorSamples.length < 5) errorSamples.push(`${key} ${JSON.stringify(err.details ?? null)}`);
    return null;
  }
}

async function makePlayer(i: number): Promise<Player> {
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID,
  }, `p${i}`);
  await signInAnonymously(getAuth(app));
  const fns = getFunctions(app, 'us-central1');
  return {
    name: `Load ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? 'x' : ''}`,
    call: async (fn, data) => (await httpsCallable(fns, fn)(data)).data,
    db: getFirestore(app), seatId: '',
  };
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]) : NaN;
};

const players = await Promise.all(Array.from({ length: SEATS }, (_, i) => makePlayer(i)));
const host = players[0];
const created = await timed('createGame', () => host.call('createGame', { name: host.name }));
if (!created) { console.error('createGame failed', failures); process.exit(1); }
const { gameId, code } = created;
host.seatId = created.seatId;
console.log(`game ${gameId} code ${code}`);

await Promise.all(players.slice(1).map(async (p) => {
  const r = await timed('joinGame', () => p.call('joinGame', { code, name: p.name }));
  if (r) p.seatId = r.seatId;
}));
const seated = players.filter((p) => p.seatId);

await Promise.all(Array.from({ length: TASKS }, (_, i) =>
  timed('addTask', () => seated[i % seated.length].call('addTask', { gameId, text: `Load task ${i + 1}` }))));

const launched = await timed('launchGame', () => host.call('launchGame', { gameId }));
if (!launched) { console.error('launch failed', failures); }

// Pre-read each seat's board so toggles hit real cells.
const boards = new Map<string, boolean[]>();
for (const p of seated) {
  const b = await getDoc(doc(p.db, 'games', gameId, 'boards', p.seatId));
  if (b.exists()) boards.set(p.seatId, b.data().marks as boolean[]);
}
const rand = (n: number) => Math.floor(Math.random() * n);
const plan = Array.from({ length: TOGGLES }, () => ({ p: seated[rand(seated.length)], cell: rand(25) }));
await Promise.all(plan.map(({ p, cell }) => timed('toggleMark', () => p.call('toggleMark', { gameId, cellIndex: cell }))));

// Verify.
const gameSnap = await getDoc(doc(host.db, 'games', gameId));
const bingoCount = gameSnap.data()?.bingoCount as number;
const bingos = (await getDocs(collection(host.db, 'games', gameId, 'bingos'))).docs.map((d) => d.data() as { seq: number });
const seqs = bingos.map((b) => b.seq).sort((a, b) => a - b);
const gaps = seqs.some((s, i) => s !== i + 1);

console.log('---');
console.log(`calls ok=${ok} failed=${failed}`);
for (const [k, v] of Object.entries(failures)) console.log(`  FAIL x${v}: ${k}`);
errorSamples.forEach((s) => console.log(`  sample: ${s}`));
for (const [k, xs] of Object.entries(latencies)) console.log(`${k}: n=${xs.length} p50=${pct(xs, 0.5)}ms p95=${pct(xs, 0.95)}ms`);
console.log(`bingoCount=${bingoCount} bingoDocs=${bingos.length} seqs=${seqs.length ? `${seqs[0]}..${seqs[seqs.length - 1]}` : 'none'} gaps=${gaps}`);
const p50 = pct(latencies.toggleMark ?? [], 0.5);
const pass = failed === 0 && bingoCount === bingos.length && !gaps && p50 < 800;
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
