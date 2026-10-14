import { FilterBar } from '@/components/FilterBar';
import { StreamStatus } from '@/components/StreamStatus';
import { TaskTable } from '@/components/TaskTable';
import { WeeklyView } from '@/components/WeeklyView';
import { useTaskStream } from '@/hooks/useTaskStream';
import { useTasks } from '@/hooks/useTasks';
import { scopeFilter, tableFilter } from '@/lib/filters';
import { useUIStore } from '@/store/ui-store';
import { useMemo } from 'react';

export default function App() {
  const { connected } = useTaskStream();
  const { data: tasks = [], isLoading } = useTasks();
  const s = useUIStore();

  // The weekly view uses the scope filters (collections, person, priority)
  // but not the status/sort controls.
  const weeklyTasks = useMemo(() => scopeFilter(tasks, s), [tasks, s]);

  const tableTasks = useMemo(() => tableFilter(tasks, s), [tasks, s]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h1 className="text-lg font-semibold">YAPA Task Dashboard</h1>
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-500">{tasks.length} tasks</span>
          <StreamStatus connected={connected} />
        </div>
      </header>
      <FilterBar />
      <main className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Loading…</div>
        ) : s.view === 'weekly' ? (
          <WeeklyView tasks={weeklyTasks} />
        ) : (
          <TaskTable tasks={tableTasks} />
        )}
      </main>
    </div>
  );
}
