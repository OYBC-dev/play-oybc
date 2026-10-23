import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { browserLocalPersistence, connectAuthEmulator, getAuth, setPersistence, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';

const REGION = 'us-central1';
const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';

interface Services { app: FirebaseApp; auth: Auth; db: Firestore; fns: Functions }
let services: Services | null = null;

/** Lazily-initialised Firebase services; nothing runs at import time, so a build without env still works. */
export function firebase(): Services {
  if (services) return services;
  const app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
      });
  const auth = getAuth(app);
  const db = getFirestore(app);
  const fns = getFunctions(app, REGION);
  void setPersistence(auth, browserLocalPersistence);
  if (useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  }
  services = { app, auth, db, fns };
  return services;
}
