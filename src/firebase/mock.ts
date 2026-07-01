/**
 * localStorage-backed mock of the tiny slice of Firestore we use.
 * Enables full offline demos without a Firebase project. Data is namespaced
 * per (uid, collection) exactly like the real nested-collection layout.
 */

type Doc = Record<string, any> & { id: string };

const KEY_PREFIX = 'bondos::';

function key(uid: string, collection: string): string {
  return `${KEY_PREFIX}${uid}::${collection}`;
}

function readAll(uid: string, collection: string): Doc[] {
  try {
    const raw = localStorage.getItem(key(uid, collection));
    return raw ? (JSON.parse(raw) as Doc[]) : [];
  } catch {
    return [];
  }
}

function writeAll(uid: string, collection: string, docs: Doc[]): void {
  localStorage.setItem(key(uid, collection), JSON.stringify(docs));
  // Notify listeners in the same tab.
  window.dispatchEvent(
    new CustomEvent('bondos-mock-change', { detail: { uid, collection } })
  );
}

export const mockDb = {
  list(uid: string, collection: string): Doc[] {
    return readAll(uid, collection);
  },

  set(uid: string, collection: string, doc: Doc): void {
    const docs = readAll(uid, collection);
    const idx = docs.findIndex((d) => d.id === doc.id);
    if (idx >= 0) docs[idx] = doc;
    else docs.push(doc);
    writeAll(uid, collection, docs);
  },

  remove(uid: string, collection: string, id: string): void {
    const docs = readAll(uid, collection).filter((d) => d.id !== id);
    writeAll(uid, collection, docs);
  },

  clearCollection(uid: string, collection: string): void {
    writeAll(uid, collection, []);
  },

  subscribe(uid: string, collection: string, cb: (docs: Doc[]) => void): () => void {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.uid === uid && detail.collection === collection) {
        cb(readAll(uid, collection));
      }
    };
    const storageHandler = (e: StorageEvent) => {
      if (e.key === key(uid, collection)) cb(readAll(uid, collection));
    };
    window.addEventListener('bondos-mock-change', handler);
    window.addEventListener('storage', storageHandler);
    // Fire once immediately.
    cb(readAll(uid, collection));
    return () => {
      window.removeEventListener('bondos-mock-change', handler);
      window.removeEventListener('storage', storageHandler);
    };
  },
};

// --- Mock auth -------------------------------------------------------------

const MOCK_USER_KEY = `${KEY_PREFIX}auth::user`;

export interface MockUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export const mockAuth = {
  current(): MockUser | null {
    try {
      const raw = localStorage.getItem(MOCK_USER_KEY);
      return raw ? (JSON.parse(raw) as MockUser) : null;
    } catch {
      return null;
    }
  },
  signIn(email: string): MockUser {
    const user: MockUser = {
      uid: 'demo-' + btoa(email).replace(/=/g, '').slice(0, 12),
      email,
      displayName: email.split('@')[0],
    };
    localStorage.setItem(MOCK_USER_KEY, JSON.stringify(user));
    window.dispatchEvent(new CustomEvent('bondos-auth-change'));
    return user;
  },
  signOut(): void {
    localStorage.removeItem(MOCK_USER_KEY);
    window.dispatchEvent(new CustomEvent('bondos-auth-change'));
  },
  subscribe(cb: (u: MockUser | null) => void): () => void {
    const handler = () => cb(mockAuth.current());
    window.addEventListener('bondos-auth-change', handler);
    cb(mockAuth.current());
    return () => window.removeEventListener('bondos-auth-change', handler);
  },
};
