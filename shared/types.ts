export type TaskStatus = 'pending' | 'in_progress' | 'blocked' | 'complete';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

/** Higher is more urgent. */
export const PRIORITY_RANK: Record<TaskPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/** Normalized task as served to the UI (decoded from a YAPA service document). */
export interface Task {
  id: string;
  collection: string;
  title: string;
  notes: string;
  tags: string[];
  status: TaskStatus;
  priority: TaskPriority;
  due_date: number | null;
  customer: string | null;
  project: string | null;
  created_at: number | null;
  updated_at: number | null;
  completed_at: number | null;
  duration_minutes: number | null;
  salience: number | null;
  /** YAPA username that created the task (server-assigned `origin_user`). */
  owner: string;
  /** Teammate who last edited it, when that was not the owner. */
  last_editor: string | null;
}

/** Server -> browser stream messages. */
export type StreamEvent =
  | { type: 'snapshot'; tasks: Task[] }
  | { type: 'upsert'; task: Task }
  | { type: 'remove'; id: string; collection: string };

export interface PersonInfo {
  name: string;
  taskCount: number;
  openCount: number;
}

export interface CollectionInfo {
  name: string;
  taskCount: number;
  projects: string[];
}

export type SortField = 'created' | 'due';
export type SortDir = 'asc' | 'desc';
