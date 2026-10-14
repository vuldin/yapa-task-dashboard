import { toTask } from '../shared/metadata';
import type { Task } from '../shared/types';
import { PULL_CONCURRENCY, PULL_OVERLAP_SECONDS } from './config';
import { type PullPage, listCollections, pullPage } from './yapa-client';

/**
 * Local mirror of every task in the shared store, kept current by pulling each
 * collection's change feed. The first pull of a collection reads its whole
 * history; later pulls start a little before the newest row already seen
 * (PULL_OVERLAP_SECONDS), the same overlap the YAPA plugin uses, so a row
 * committed with an earlier synced_at is still picked up. Applying a page is
 * idempotent, so the re-read rows are harmless.
 *
 * Document ids are unique across collections, so tasks are keyed by id alone:
 * a task moved to another collection simply arrives with its new collection.
 */
const tasks = new Map<string, { task: Task; syncedAt: number }>();
/** Newest synced_at / deleted_at seen per collection. */
const watermarks = new Map<string, number>();

function applyPage(page: PullPage): number {
  let newest = 0;
  for (const d of page.documents) {
    newest = Math.max(newest, d.synced_at);
    const existing = tasks.get(d.id);
    if (existing && existing.syncedAt > d.synced_at) continue;
    if (d.metadata.type !== 'task') {
      // Not (or no longer) a task, e.g. a memory, or an id reused for one.
      tasks.delete(d.id);
      continue;
    }
    const task = toTask(d.id, d.content, d.metadata, d.collection, {
      owner: d.origin_user,
      lastEditor: d.last_editor,
    });
    tasks.set(d.id, { task, syncedAt: d.synced_at });
  }
  for (const del of page.deletions) {
    newest = Math.max(newest, del.deleted_at);
    const existing = tasks.get(del.id);
    // A row re-created after its deletion has a later synced_at: keep it.
    if (existing && existing.syncedAt <= del.deleted_at) tasks.delete(del.id);
  }
  return newest;
}

async function syncCollection(collection: string): Promise<void> {
  const mark = watermarks.get(collection);
  const since = mark === undefined ? 0 : Math.max(0, mark - PULL_OVERLAP_SECONDS);
  let page = await pullPage(collection, { since });
  let newest = mark ?? 0;
  for (;;) {
    newest = Math.max(newest, applyPage(page));
    if (!page.has_more) break;
    page = await pullPage(collection, { cursor: page.next_cursor });
  }
  watermarks.set(collection, newest);
}

/** Run `fn` over `items` with at most `n` in flight. */
async function eachLimited<T>(
  items: T[],
  n: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

/**
 * Bring the mirror up to date and return every task. A collection that fails
 * to pull keeps its last known tasks (mirrors YAPA's tolerant `catch { continue }`)
 * so one bad collection can't blank the whole dashboard.
 */
export async function fetchAllTasks(): Promise<Task[]> {
  const collections = (await listCollections()).map((c) => c.name);
  const listed = new Set(collections);

  // A collection whose last document was deleted drops out of the listing.
  for (const name of watermarks.keys()) if (!listed.has(name)) watermarks.delete(name);
  for (const [id, entry] of tasks) if (!listed.has(entry.task.collection)) tasks.delete(id);

  await eachLimited(collections, PULL_CONCURRENCY, async (c) => {
    try {
      await syncCollection(c);
    } catch (err) {
      process.stderr.write(`[task-dashboard] skip collection ${c}: ${err}\n`);
    }
  });
  return [...tasks.values()].map((e) => e.task);
}
