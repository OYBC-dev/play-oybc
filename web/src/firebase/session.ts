import { signInAnonymously, type User } from 'firebase/auth';
import { firebase } from './app';

let pending: Promise<User> | null = null;

/** Signs in anonymously once; later calls reuse the persisted or in-flight session. */
export function ensureSignedIn(): Promise<User> {
  if (!pending) {
    const { auth } = firebase();
    pending = (async () => {
      await auth.authStateReady();
      return auth.currentUser ?? (await signInAnonymously(auth)).user;
    })().catch((e) => {
      pending = null;
      throw e;
    });
  }
  return pending;
}
