import type { Task, TaskPriority, TaskStatus } from './types';

// Mirrors YAPA's fromChroma() (vuldin/yapa, packages/core/src/metadata-adapter.ts). The
// service returns decoded JSON metadata, but rows pushed by older clients can
// still carry string-encoded arrays/objects, so decoding stays.
const ARRAY_FIELDS = ['tags', 'depends_on', 'blocks', 'related_ids'];

/** Decode primitive (ChromaDB-style) metadata back into JS values. */
export function fromChroma(metadata: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === 'string') {
      if (value.startsWith('{') || value.startsWith('[')) {
        try {
          result[key] = JSON.parse(value);
          continue;
        } catch {
          // not valid JSON, fall through as string
        }
      }
      if (ARRAY_FIELDS.includes(key)) {
        result[key] = value === '' ? [] : value.split(',').filter(Boolean);
      } else {
        result[key] = value;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s === '' ? null : s;
}

/** Build a normalized Task from a YAPA service document. */
export function toTask(
  id: string,
  document: string | null,
  rawMeta: Record<string, unknown>,
  collection: string,
  author: { owner: string; lastEditor: string | null },
): Task {
  const m = fromChroma(rawMeta);
  const tags = Array.isArray(m.tags) ? (m.tags as string[]) : [];
  return {
    id,
    collection,
    title: (str(m.title) ?? document ?? id) as string,
    notes: (str(m.notes) ?? '') as string,
    tags,
    status: (m.status as TaskStatus) ?? 'pending',
    priority: (m.priority as TaskPriority) ?? 'medium',
    // 0 is the sentinel YAPA writes when a due date is cleared -> treat as unset.
    due_date: num(m.due_date) || null,
    customer: str(m.customer),
    project: str(m.project),
    created_at: num(m.created_at),
    updated_at: num(m.updated_at),
    completed_at: num(m.completed_at),
    duration_minutes: num(m.duration_minutes),
    salience: num(m.salience),
    owner: author.owner,
    last_editor: author.lastEditor && author.lastEditor !== author.owner ? author.lastEditor : null,
  };
}
