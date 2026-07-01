import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth, USE_MOCK } from './config';
import { mockAuth } from './mock';
import type { AppUser } from '@/types';

export function watchAuth(cb: (user: AppUser | null) => void): () => void {
  if (USE_MOCK) {
    return mockAuth.subscribe((u) =>
      cb(u ? { uid: u.uid, email: u.email, displayName: u.displayName } : null)
    );
  }
  return onAuthStateChanged(auth!, (u) =>
    cb(u ? { uid: u.uid, email: u.email, displayName: u.displayName } : null)
  );
}

export async function login(email: string, password: string): Promise<void> {
  if (USE_MOCK) {
    mockAuth.signIn(email);
    return;
  }
  await signInWithEmailAndPassword(auth!, email, password);
}

export async function register(email: string, password: string): Promise<void> {
  if (USE_MOCK) {
    mockAuth.signIn(email);
    return;
  }
  await createUserWithEmailAndPassword(auth!, email, password);
}

export async function logout(): Promise<void> {
  if (USE_MOCK) {
    mockAuth.signOut();
    return;
  }
  await fbSignOut(auth!);
}
