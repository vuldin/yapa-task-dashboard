import type { Task } from '@shared/types';
import { isoWeekKey, weekRangeLabel } from '@shared/week';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface WeekBucket {
  key: string;
  label: string;
  sortTs: number;
  count: number;
  tasks: Task[];
}

function bucketize(tasks: Task[]): WeekBucket[] {
  const map = new Map<string, WeekBucket>();
  for (const t of tasks) {
    const ts = t.completed_at ?? t.updated_at;
    const key = ts == null ? 'unknown' : isoWeekKey(ts);
    let b = map.get(key);
    if (!b) {
      b = {
        key,
        label: ts == null ? 'unknown' : weekRangeLabel(ts),
        sortTs: ts ?? 0,
        count: 0,
        tasks: [],
      };
      map.set(key, b);
    }
    b.count++;
    b.tasks.push(t);
  }
  return [...map.values()].sort((a, b) => a.sortTs - b.sortTs);
}

export function WeeklyView({ tasks }: { tasks: Task[] }) {
  const completed = useMemo(() => tasks.filter((t) => t.status === 'complete'), [tasks]);
  const buckets = useMemo(() => bucketize(completed), [completed]);

  if (completed.length === 0) {
    return <div className="p-8 text-center text-slate-500">No completed tasks yet.</div>;
  }

  const chartData = buckets.map((b) => ({ label: b.label, count: b.count }));

  return (
    <div className="space-y-6 p-4">
      <div className="h-72 rounded border border-slate-800 bg-slate-900/40 p-3">
        <h2 className="mb-2 text-sm font-semibold text-slate-300">Tasks closed per week</h2>
        <ResponsiveContainer width="100%" height="90%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                background: '#0f172a',
                border: '1px solid #334155',
                color: '#e2e8f0',
              }}
            />
            <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-4">
        {[...buckets].reverse().map((b) => {
          return (
            <div key={b.key} className="rounded border border-slate-800">
              <div className="flex items-center justify-between bg-slate-900 px-3 py-2 text-sm">
                <span className="font-semibold">{b.label}</span>
                <span className="text-slate-400">{b.count} closed</span>
              </div>
              <ul className="divide-y divide-slate-800">
                {b.tasks.map((t) => (
                  <li key={`${t.collection}:${t.id}`} className="px-3 py-1.5 text-sm">
                    <span className="text-slate-500">{t.id}</span> {t.title}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
