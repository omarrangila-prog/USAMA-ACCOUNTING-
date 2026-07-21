import { create } from 'zustand';

/**
 * Tiny shared flag so the global form shortcuts (F1–F4) can warn before leaving
 * an entry form that has unsaved data. The active entry form sets `dirty` while
 * the user has typed something not yet saved; the shortcut handler checks it and
 * shows a keyboard-accessible confirm before switching forms.
 *
 * This does not touch any accounting logic — it only gates navigation.
 */
interface FormGuard {
  dirty: boolean;
  setDirty: (v: boolean) => void;
}

export const useFormGuard = create<FormGuard>((set) => ({
  dirty: false,
  setDirty: (v) => set({ dirty: v }),
}));
