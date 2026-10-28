/**
 * LEGACY Firestore backend only, until cutover: emergency host transfer against the deployed Firestore game
 * data (`play-oybc`), for when the host's phone is lost on the live site that still runs the Firebase backend.
 * The realtime server's equivalent is `forceHost.ts` (Worker admin route). Delete this file after cutover.
 *
 * Usage:
 *   pnpm --filter scripts forceHostLegacy <JOINCODE>            lists seats (seatId, name, occupied, host)
 *   pnpm --filter scripts forceHostLegacy <JOINCODE> <seatId>   makes that seat the host
 *
 * Credentials: application-default (`gcloud auth application-default login`) or GOOGLE_APPLICATION_CREDENTIALS.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT = 'play-oybc';

/**
 * Resolves a join code, then lists seats or moves `hostSeatId` to an occupied seat in one transaction.
 * @throws Error on an unknown code/game, unknown seat, or a seat nobody holds.
 */
async function main(): Promise<void> {
  const [rawCode, seatId] = process.argv.slice(2);
  if (!rawCode) throw new Error('usage: forceHost <JOINCODE> [seatId]');
  const code = rawCode.trim().toUpperCase();

  initializeApp({ projectId: PROJECT });
  const db = getFirestore();
  const codeSnap = await db.doc(`codes/${code}`).get();
  if (!codeSnap.exists) throw new Error(`no game for code ${code}`);
  const gameId = (codeSnap.data() as { gameId: string }).gameId;
  const game = db.doc(`games/${gameId}`);

  if (!seatId) {
    const [gameSnap, seats, members] = await Promise.all([game.get(), game.collection('seats').get(), game.collection('members').get()]);
    const host = gameSnap.data()?.hostSeatId as string | undefined;
    const held = new Set(members.docs.map((d) => d.data().seatId as string));
    console.log(`game ${gameId} (code ${code}), host seat ${host}`);
    for (const s of seats.docs) {
      console.log(`${s.id}  ${s.data().name}${held.has(s.id) ? '' : '  (unoccupied)'}${s.id === host ? '  [host]' : ''}`);
    }
    return;
  }

  const { before, after } = await db.runTransaction(async (tx) => {
    const [gameSnap, seatSnap, holders] = await Promise.all([
      tx.get(game), tx.get(game.collection('seats').doc(seatId)), tx.get(game.collection('members').where('seatId', '==', seatId)),
    ]);
    if (!gameSnap.exists) throw new Error(`game ${gameId} not found`);
    if (!seatSnap.exists) throw new Error(`seat ${seatId} not found in game ${gameId}`);
    if (holders.empty) throw new Error(`seat ${seatId} is not occupied`);
    tx.update(game, { hostSeatId: seatId });
    return { before: gameSnap.data()?.hostSeatId as string, after: seatId };
  });
  console.log(`game ${gameId} (code ${code}): hostSeatId ${before} -> ${after}`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
