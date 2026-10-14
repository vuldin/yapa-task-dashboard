import { cn } from '@/lib/cn';
import type { Task } from '@shared/types';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { PriorityBadge, StatusBadge } from './StatusBadge';

const fmtDate = (ts: number | null) => (ts == null ? '—' : format(new Date(ts * 1000), 'MMM d'));
const scope = (t: Task) => t.customer ?? t.project ?? t.collection;

const col = createColumnHelper<Task>();
const nowSec = () => Math.floor(Date.now() / 1000);

const columns = [
  col.accessor('title', {
    header: 'Task',
    cell: (c) => <span className="font-medium">{c.getValue()}</span>,
  }),
  col.accessor('status', { header: 'Status', cell: (c) => <StatusBadge status={c.getValue()} /> }),
  col.accessor('priority', {
    header: 'Priority',
    cell: (c) => <PriorityBadge priority={c.getValue()} />,
  }),
  col.accessor('owner', {
    header: 'Owner',
    cell: (c) => {
      const editor = c.row.original.last_editor;
      return (
        <span title={editor ? `last edited by ${editor}` : undefined}>
          {c.getValue()}
          {editor && <span className="text-slate-500"> · ✎ {editor}</span>}
        </span>
      );
    },
  }),
  col.display({ id: 'scope', header: 'Scope', cell: (c) => scope(c.row.original) }),
  col.accessor('due_date', {
    header: 'Due',
    cell: (c) => {
      const v = c.getValue();
      const overdue = v != null && v < nowSec() && c.row.original.status !== 'complete';
      return <span className={cn(overdue && 'text-red-400')}>{fmtDate(v)}</span>;
    },
  }),
  col.accessor('created_at', { header: 'Created', cell: (c) => fmtDate(c.getValue()) }),
  col.accessor('id', {
    header: 'ID',
    cell: (c) => <span className="text-slate-500">{c.getValue()}</span>,
  }),
];

export function TaskTable({ tasks }: { tasks: Task[] }) {
  const table = useReactTable({ data: tasks, columns, getCoreRowModel: getCoreRowModel() });

  if (tasks.length === 0) {
    return <div className="p-8 text-center text-slate-500">No tasks match these filters.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-slate-900 text-left text-xs uppercase text-slate-400">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th key={h.id} className="px-3 py-2 font-semibold">
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-800 hover:bg-slate-900/50">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2 align-top">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
