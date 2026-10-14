import type { CollectionInfo, PersonInfo, Task } from '@shared/types';

const RELOAD_KEY = 'task-dashboard:auth-reload-at';

/**
 * A 401 means the IAP session expired: a full page load lets IAP send the
 * viewer through Google sign-in again. At most once a minute, so a broken
 * deployment can't reload in a loop.
 */
function reloadForSignIn(): void {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage unavailable: still reload once; the next 401 lands here again.
  }
  window.location.reload();
}

async function api(path: string): Promise<Response> {
  const res = await fetch(path, { credentials: 'same-origin' });
  if (res.status === 401) reloadForSignIn();
  return res;
}

export interface Viewer {
  email: string;
  username: string;
}

export async function fetchMe(): Promise<{ viewer: Viewer | null; authMode: 'iap' | 'local' }> {
  const res = await api('/api/me');
  if (!res.ok) throw new Error(`fetchMe failed: ${res.status}`);
  return await res.json();
}

export async function fetchTasks(): Promise<Task[]> {
  const res = await api('/api/tasks?all=true');
  if (!res.ok) throw new Error(`fetchTasks failed: ${res.status}`);
  const data = (await res.json()) as { tasks: Task[] };
  return data.tasks;
}

export interface CollectionsResponse {
  collections: CollectionInfo[];
  projects: string[];
  people: PersonInfo[];
}

export async function fetchCollections(): Promise<CollectionsResponse> {
  const res = await api('/api/collections');
  if (!res.ok) throw new Error(`fetchCollections failed: ${res.status}`);
  return (await res.json()) as CollectionsResponse;
}

export interface Health {
  service: string;
  serviceOk: boolean;
  /** The principal the backend reads yapa-service as. */
  reader: { username: string; email: string } | null;
  lastOk: number;
  lastError: string | null;
  taskCount: number;
  clients: number;
}

export async function fetchHealth(): Promise<Health> {
  const res = await api('/api/health');
  if (!res.ok) throw new Error(`fetchHealth failed: ${res.status}`);
  return (await res.json()) as Health;
}
