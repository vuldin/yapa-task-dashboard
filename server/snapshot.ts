import type { StreamEvent, Task } from '../shared/types';

export type Snapshot = Map<string, { hash: string; task: Task }>;

const key = (t: Task) => `${t.collection}:${t.id}`;

// Hash over UI-relevant fields. Content-based (not updated_at alone) so a change
// is detected even if a writer forgets to bump updated_at.
function hashTask(t: Task): string {
  return [
    t.status,
    t.priority,
    t.title,
    t.notes,
    t.due_date,
    t.customer,
    t.project,
    t.completed_at,
    t.duration_minutes,
    t.updated_at,
    t.tags.join(','),
    t.owner,
    t.last_editor,
  ].join('|');
}

export function buildSnapshot(tasks: Task[]): Snapshot {
  const snap: Snapshot = new Map();
  for (const t of tasks) snap.set(key(t), { hash: hashTask(t), task: t });
  return snap;
}

/** Compute upsert/remove deltas between two snapshots. */
export function diff(prev: Snapshot, next: Snapshot): StreamEvent[] {
  const events: StreamEvent[] = [];
  for (const [k, entry] of next) {
    const before = prev.get(k);
    if (!before || before.hash !== entry.hash) {
      events.push({ type: 'upsert', task: entry.task });
    }
  }
  for (const [k, entry] of prev) {
    if (!next.has(k)) {
      events.push({ type: 'remove', id: entry.task.id, collection: entry.task.collection });
    }
  }
  return events;
}
