import { create } from 'zustand';
import type { AppUser } from '@/types';
import { USE_MOCK } from '@/firebase/config';
import { clientForWorkspace, type ClientConfig } from '@/config/clients';

/**
 * Multi-client workspaces. The app still has no Firebase Auth sign-in — instead
 * the login PIN (see PinLock + src/config/clients.ts) selects WHICH workspace to
 * load. Each client's data lives under users/{workspace}/… in Firestore (or
 * localStorage in mock mode), fully isolated from every other client.
 *
 * The EXISTING client keeps workspace 'bond-workspace' with all their live data
 * untouched; new clients (PIN 5555, 6666, …) get their own empty workspace.
 *
 * NOTE: because there is still no auth, the Firestore security rules are open
 * for the users/{workspace} paths — see firestore.rules.
 */
export const WORKSPACE_UID = 'bond-workspace'; // existing client (default / fallback)

/** sessionStorage key holding the active client's workspace id after login. */
const ACTIVE_WORKSPACE_KEY = 'bond.workspace';

/** The workspace chosen at login this session, or the default if none yet. */
export function activeWorkspace(): string {
  try {
    return sessionStorage.getItem(ACTIVE_WORKSPACE_KEY) || WORKSPACE_UID;
  } catch {
    return WORKSPACE_UID;
  }
}

/** Persist the logged-in client's workspace for the rest of the session. */
export function setActiveWorkspace(workspace: string): void {
  try {
    sessionStorage.setItem(ACTIVE_WORKSPACE_KEY, workspace);
  } catch {
    /* ignore storage errors */
  }
}

function userFor(workspace: string): AppUser {
  const client: ClientConfig | null = clientForWorkspace(workspace);
  return {
    uid: workspace,
    email: null,
    displayName: client?.name ?? 'Owner',
  };
}

interface AuthStore {
  user: AppUser | null;
  loading: boolean;
  mockMode: boolean;
  /** Re-read the active workspace from the session (after PIN login). */
  refresh: () => void;
  init: () => () => void;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthStore>((set) => ({
  user: userFor(activeWorkspace()),
  loading: false,
  mockMode: USE_MOCK,
  refresh: () => set({ user: userFor(activeWorkspace()) }),
  // Auth lifecycle: user is the active workspace owner (chosen by login PIN).
  init: () => {
    set({ user: userFor(activeWorkspace()), loading: false });
    return () => {};
  },
  signOut: async () => {
    try {
      sessionStorage.removeItem(ACTIVE_WORKSPACE_KEY);
      sessionStorage.removeItem('bond.unlocked');
    } catch {
      /* ignore */
    }
    set({ user: null });
  },
}));
