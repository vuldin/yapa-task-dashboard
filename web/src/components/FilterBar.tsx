import { CollectionPicker } from '@/components/CollectionPicker';
import { useTasks } from '@/hooks/useTasks';
import { useViewer } from '@/hooks/useViewer';
import { cn } from '@/lib/cn';
import { type View, useUIStore } from '@/store/ui-store';
import type { TaskPriority, TaskStatus } from '@shared/types';
import { useMemo } from 'react';

const VIEWS: { id: View; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'all', label: 'All' },
  { id: 'weekly', label: 'Closed by week' },
];

const STATUSES: TaskStatus[] = ['pending', 'in_progress', 'blocked', 'complete'];

/** Minimum-priority choices, most inclusive first. */
const MIN_PRIORITIES: { value: TaskPriority | ''; label: string }[] = [
  { value: '', label: 'Any priority' },
  { value: 'medium', label: 'Medium or higher' },
  { value: 'high', label: 'High or higher' },
  { value: 'critical', label: 'Critical only' },
];

const btn = 'rounded px-3 py-1 text-sm border border-slate-700';

export function FilterBar() {
  const s = useUIStore();
  const { data: tasks = [] } = useTasks();
  const me = useViewer()?.username;

  // Derived from the live task set so a new teammate shows up without a reload.
  const people = useMemo(() => {
    const open = new Map<string, number>();
    for (const t of tasks) {
      open.set(t.owner, (open.get(t.owner) ?? 0) + (t.status === 'complete' ? 0 : 1));
    }
    return [...open.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [tasks]);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3">
      <div className="flex gap-1">
        {VIEWS.map((v) => (
          <button
            type="button"
            key={v.id}
            onClick={() => s.setView(v.id)}
            className={cn(btn, s.view === v.id ? 'bg-blue-700 border-blue-600' : 'bg-slate-900')}
          >
            {v.label}
          </button>
        ))}
      </div>

      {s.view !== 'weekly' && (
        <div className="flex gap-1">
          {STATUSES.map((st) => (
            <button
              type="button"
              key={st}
              onClick={() => s.toggleStatus(st)}
              className={cn(
                btn,
                'text-xs',
                s.statuses.includes(st) ? 'bg-slate-600' : 'bg-slate-900 text-slate-400',
              )}
            >
              {st.replace('_', ' ')}
            </button>
          ))}
        </div>
      )}

      <select
        className={cn(btn, 'bg-slate-900')}
        value={s.owner ?? ''}
        onChange={(e) => s.setOwner(e.target.value || null)}
      >
        <option value="">Everyone</option>
        {people.map(([name, open]) => (
          <option key={name} value={name}>
            {name === me ? `${name} (me)` : name} · {open} open
          </option>
        ))}
      </select>

      <CollectionPicker />

      <select
        aria-label="Minimum priority"
        className={cn(btn, s.minPriority ? 'bg-slate-600' : 'bg-slate-900')}
        value={s.minPriority ?? ''}
        onChange={(e) => s.setMinPriority((e.target.value || null) as TaskPriority | null)}
      >
        {MIN_PRIORITIES.map((p) => (
          <option key={p.label} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>

      {s.view !== 'weekly' && (
        <div className="flex items-center gap-1">
          <select
            className={cn(btn, 'bg-slate-900')}
            value={s.sortField}
            onChange={(e) => s.setSort(e.target.value as 'created' | 'due')}
          >
            <option value="due">Sort: due</option>
            <option value="created">Sort: created</option>
          </select>
          <button type="button" className={cn(btn, 'bg-slate-900')} onClick={s.toggleDir}>
            {s.sortDir === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      )}
    </div>
  );
}
