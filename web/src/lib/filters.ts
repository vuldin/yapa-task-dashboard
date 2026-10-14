import type { useUIStore } from '@/store/ui-store';
import { PRIORITY_RANK, type Task } from '@shared/types';

type UI = ReturnType<typeof useUIStore.getState>;

/** Filters shared by every view: collections, person and minimum priority. */
export function scopeFilter(tasks: Task[], s: UI): Task[] {
  let list = tasks;
  if (s.collections.length > 0) {
    const wanted = new Set(s.collections);
    list = list.filter((t) => wanted.has(t.collection));
  }
  if (s.owner) list = list.filter((t) => t.owner === s.owner);
  if (s.minPriority) {
    const min = PRIORITY_RANK[s.minPriority];
    list = list.filter((t) => PRIORITY_RANK[t.priority] >= min);
  }
  return list;
}

/** The table: scope filters, then view/status, then sort (nulls last). */
export function tableFilter(tasks: Task[], s: UI): Task[] {
  let list = scopeFilter(tasks, s);
  if (s.view === 'open') list = list.filter((t) => t.status !== 'complete');
  if (s.statuses.length > 0) list = list.filter((t) => s.statuses.includes(t.status));

  const pick = s.sortField === 'due' ? (t: Task) => t.due_date : (t: Task) => t.created_at;
  const mult = s.sortDir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = pick(a);
    const bv = pick(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * mult;
  });
}
