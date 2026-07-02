import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

const env = import.meta.env;

/**
 * Firebase WEB config for the "osama-accounting" project.
 *
 * These values are intentionally hard-coded as a fallback so the desktop .exe
 * and any deploy are ALWAYS connected to Firebase without needing env vars set.
 *
 * This is safe: Firebase web config is NOT secret — it ships in every browser
 * bundle by design. Your data is protected by Firestore Security Rules
 * (firestore.rules), not by hiding these keys. Env vars still override these
 * (so a different environment can point at its own project).
 */
const DEFAULT_FIREBASE = {
  apiKey: 'AIzaSyBDsR-tJotkYb_RCVL7KLQD9STHS4S7X7Q',
  authDomain: 'osama-accounting.firebaseapp.com',
  projectId: 'osama-accounting',
  storageBucket: 'osama-accounting.firebasestorage.app',
  messagingSenderId: '13784767386',
  appId: '1:13784767386:web:d365278f0669bd86e9f823',
};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || DEFAULT_FIREBASE.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_FIREBASE.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || DEFAULT_FIREBASE.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_FIREBASE.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_FIREBASE.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || DEFAULT_FIREBASE.appId,
};

// Allow forcing local mock mode via ?mock=1 (used for isolated QA runs so tests
// never touch real Firestore). Only honored in dev builds.
const forceMock =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('mock') === '1';

// Real Firebase is always available now (config has a baked-in fallback), so
// USE_MOCK is only true when explicitly requested.
export const USE_MOCK = forceMock || env.VITE_USE_MOCK === 'true';

// Config is always present now, so this never trips — kept for API stability.
export const MISCONFIGURED_PROD = false;

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
