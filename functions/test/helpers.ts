import { initializeApp as initAdmin, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore as getClientFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

export const PROJECT = 'demo-play-oybc';

if (getAdminApps().length === 0) initAdmin({ projectId: PROJECT });
/** Admin Firestore handle (talks to FIRESTORE_EMULATOR_HOST). */
export const admin = getFirestore();

interface Client { app: FirebaseApp; uid: string; call: (fn: string, data: unknown) => Promise<unknown> }
const clients = new Map<string, Promise<Client>>();

async function client(key: string): Promise<Client> {
  let c = clients.get(key);
  if (!c) {
    c = (async () => {
      const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-key' }, `${key}-${clients.size}-${Date.now()}`);
      const auth = getAuth(app);
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      const cred = await signInAnonymously(auth);
      const fns = getFunctions(app, 'us-central1');
      connectFunctionsEmulator(fns, '127.0.0.1', 5001);
      return { app, uid: cred.user.uid, call: async (fn, data) => (await httpsCallable(fns, fn)(data)).data };
    })();
    clients.set(key, c);
  }
  return c;
}

/** The anonymous uid for a named test user (signs in on first use). */
export async function uidOf(user: string): Promise<string> {
  return (await client(user)).uid;
}

/** Calls a callable as the named test user (own anonymous auth identity per user). */
export async function callAs<T = any>(user: string, fn: string, data: unknown): Promise<T> {
  return (await client(user)).call(fn, data) as Promise<T>;
}

/** Reads a document via Admin; returns its data or undefined. */
export async function readAdmin(path: string): Promise<any> {
  return (await admin.doc(path).get()).data();
}

/** Wipes the Firestore emulator and forgets cached clients' state (auth users persist, which is fine). */
export async function clearFirestore(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
  const res = await fetch(`http://${host}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`clearFirestore failed: ${res.status}`);
}

/** Resolves with the HttpsError `details.code` of a failing callable, or throws if it succeeds. */
export async function appCodeOf(p: Promise<unknown>): Promise<string | undefined> {
  try { await p; } catch (e: any) { return e?.details?.code ?? `https:${e?.code}`; }
  throw new Error('expected call to fail');
}

/** A client-SDK Firestore handle authenticated as the named test user (for rules checks). */
export async function firestoreAs(user: string) {
  const { app } = await client(user);
  const fs = getClientFirestore(app);
  try {
    const [h, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
    connectFirestoreEmulator(fs, h, Number(port));
  } catch { /* already connected */ }
  return fs;
}
