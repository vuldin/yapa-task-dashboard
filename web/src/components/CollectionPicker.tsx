import { useTasks } from '@/hooks/useTasks';
import { cn } from '@/lib/cn';
import { useUIStore } from '@/store/ui-store';
import { useEffect, useMemo, useRef, useState } from 'react';

const btn = 'rounded px-3 py-1 text-sm border border-slate-700';

/** Shortcuts that select every collection with a prefix. */
const GROUPS = [
  { label: 'Customers', prefix: 'customer-' },
  { label: 'Projects', prefix: 'project-' },
];

export function CollectionPicker() {
  const { collections: selected, toggleCollection, setCollections } = useUIStore();
  const { data: tasks = [] } = useTasks();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  // Derived from the live task set (open-task counts), so a new collection
  // shows up without a reload.
  const all = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      counts.set(t.collection, (counts.get(t.collection) ?? 0) + (t.status === 'complete' ? 0 : 1));
    }
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [tasks]);

  const shown = query ? all.filter(([name]) => name.includes(query.trim().toLowerCase())) : all;

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label =
    selected.length === 0
      ? 'All collections'
      : selected.length === 1
        ? selected[0]
        : `${selected.length} collections`;

  const selectGroup = (prefix: string) => {
    const names = all.map(([name]) => name).filter((n) => n.startsWith(prefix));
    setCollections([...new Set([...selected, ...names])]);
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(btn, selected.length > 0 ? 'bg-slate-600' : 'bg-slate-900')}
      >
        {label} ▾
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-1 w-80 rounded border border-slate-700 bg-slate-900 shadow-lg">
          <div className="space-y-2 border-b border-slate-800 p-2">
            <input
              ref={search}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search collections"
              className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
            />
            <div className="flex flex-wrap gap-1 text-xs">
              {GROUPS.map((g) => (
                <button
                  type="button"
                  key={g.prefix}
                  onClick={() => selectGroup(g.prefix)}
                  className="rounded border border-slate-700 px-2 py-0.5 hover:bg-slate-800"
                >
                  + {g.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCollections([])}
                disabled={selected.length === 0}
                className="ml-auto rounded border border-slate-700 px-2 py-0.5 hover:bg-slate-800 disabled:opacity-40"
              >
                Clear
              </button>
            </div>
          </div>

          <ul aria-label="Collections" className="max-h-80 overflow-auto py-1">
            {shown.map(([name, openCount]) => (
              <li key={name}>
                <label className="flex cursor-pointer items-center gap-2 px-3 py-1 text-sm hover:bg-slate-800">
                  <input
                    type="checkbox"
                    checked={selected.includes(name)}
                    onChange={() => toggleCollection(name)}
                  />
                  <span className="flex-1 truncate">{name}</span>
                  <span className="text-xs text-slate-500">{openCount} open</span>
                </label>
              </li>
            ))}
            {shown.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-500">No matching collections.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
