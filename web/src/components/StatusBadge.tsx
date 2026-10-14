import { cn } from '@/lib/cn';
import type { TaskPriority, TaskStatus } from '@shared/types';

const STATUS_STYLES: Record<TaskStatus, string> = {
  pending: 'bg-slate-700 text-slate-200',
  in_progress: 'bg-blue-900 text-blue-200',
  blocked: 'bg-red-900 text-red-200',
  complete: 'bg-green-900 text-green-200',
};

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  critical: 'bg-red-800 text-red-100',
  high: 'bg-orange-900 text-orange-200',
  medium: 'bg-slate-700 text-slate-200',
  low: 'bg-slate-800 text-slate-400',
};

const pill = 'inline-block rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap';

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={cn(pill, STATUS_STYLES[status])}>{status.replace('_', ' ')}</span>;
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <span className={cn(pill, PRIORITY_STYLES[priority])}>{priority}</span>;
}
