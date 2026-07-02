import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

/**
 * When VITE_USE_MOCK === "true" OR the required Firebase env vars are missing,
 * the app runs in fully-offline mock mode (data persisted to localStorage) so
 * it is usable for demos without any Firebase project. See src/firebase/mock.
 */
const env = import.meta.env;

// Allow forcing local mock mode via ?mock=1 (used for isolated QA runs so tests
// never touch real Firestore). Only honored in dev builds.
const forceMock =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('mock') === '1';

export const USE_MOCK =
  forceMock || env.VITE_USE_MOCK === 'true' || !env.VITE_FIREBASE_API_KEY;

/**
 * True when a PRODUCTION build ended up in mock mode because the Firebase keys
 * were missing (not because the user deliberately set VITE_USE_MOCK=true).
 * This is the classic "deployed to Vercel but no data shows" situation — env
 * vars weren't set at build time. The app surfaces a visible banner for this.
 */
export const MISCONFIGURED_PROD =
  import.meta.env.PROD &&
  env.VITE_USE_MOCK !== 'true' &&
  !env.VITE_FIREBASE_API_KEY;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

if (!USE_MOCK) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  // Offline-first: IndexedDB cache with multi-tab sync. Writes queue while
  // offline and flush automatically when connectivity returns.
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
}

export { app, auth, db };
