import { create } from 'zustand';
import type { AppUser } from '@/types';
import { USE_MOCK } from '@/firebase/config';

/**
 * Login has been removed. The whole business runs in a single shared workspace
 * so data lives under users/{WORKSPACE_UID}/… in Firestore (or localStorage in
 * mock mode). No sign-in screen; the app opens straight to the dashboard.
 *
 * NOTE: because there is no auth, the Firestore security rules are open for
 * this workspace path — see firestore.rules. Suitable for a single-tenant
 * in-house deployment.
 */
export const WORKSPACE_UID = 'bond-workspace';

const WORKSPACE_USER: AppUser = {
  uid: WORKSPACE_UID,
  email: null,
  displayName: 'Owner',
};

interface AuthStore {
  user: AppUser | null;
  loading: boolean;
  mockMode: boolean;
  init: () => () => void;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthStore>((set) => ({
  user: WORKSPACE_USER,
  loading: false,
  mockMode: USE_MOCK,
  // No-op auth lifecycle: user is always the fixed workspace owner.
  init: () => {
    set({ user: WORKSPACE_USER, loading: false });
    return () => {};
  },
  signOut: async () => {
    /* login removed — nothing to sign out of */
  },
}));
