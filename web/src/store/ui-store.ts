import type { SortDir, SortField, TaskPriority, TaskStatus } from '@shared/types';
import { create } from 'zustand';

export type View = 'open' | 'all' | 'weekly';

interface UIState {
  view: View;
  statuses: TaskStatus[];
  /** Selected collections; empty = all. */
  collections: string[];
  /** YAPA username; null = everyone. */
  owner: string | null;
  /** Show tasks at this priority or above; null = any. */
  minPriority: TaskPriority | null;
  sortField: SortField;
  sortDir: SortDir;
  setView: (v: View) => void;
  toggleStatus: (s: TaskStatus) => void;
  toggleCollection: (c: string) => void;
  setCollections: (c: string[]) => void;
  setOwner: (o: string | null) => void;
  setMinPriority: (p: TaskPriority | null) => void;
  setSort: (f: SortField) => void;
  toggleDir: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  view: 'open',
  statuses: [],
  collections: [],
  owner: null,
  minPriority: null,
  sortField: 'due',
  sortDir: 'asc',
  setView: (view) => set({ view }),
  toggleStatus: (s) =>
    set((st) => ({
      statuses: st.statuses.includes(s) ? st.statuses.filter((x) => x !== s) : [...st.statuses, s],
    })),
  toggleCollection: (c) =>
    set((st) => ({
      collections: st.collections.includes(c)
        ? st.collections.filter((x) => x !== c)
        : [...st.collections, c],
    })),
  setCollections: (collections) => set({ collections }),
  setOwner: (owner) => set({ owner }),
  setMinPriority: (minPriority) => set({ minPriority }),
  setSort: (sortField) => set({ sortField }),
  toggleDir: () => set((st) => ({ sortDir: st.sortDir === 'asc' ? 'desc' : 'asc' })),
}));
