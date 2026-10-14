import type { Task } from '../shared/types';
import { POLL_INTERVAL_MS } from './config';
import { type Snapshot, buildSnapshot, diff } from './snapshot';
import { broadcast } from './sse';
import { fetchAllTasks } from './task-service';
import { whoami } from './yapa-client';

let prev: Snapshot = new Map();
let latest: Task[] = [];
let lastOk = 0;
let lastError: string | null = null;
/** The principal the backend reads yapa-service as (you locally, svc-* on GCP). */
let reader: { username: string; email: string } | null = null;

/** Most recent successful full task list (served to REST without a service hit). */
export function getLatestTasks(): Task[] {
  return latest;
}

export function getPollState() {
  return { lastOk, lastError, taskCount: latest.length, reader };
}

async function tick(): Promise<void> {
  try {
    if (!reader) {
      const { username, email } = await whoami();
      reader = { username, email };
    }
    const tasks = await fetchAllTasks();
    const next = buildSnapshot(tasks);
    const events = diff(prev, next);
    broadcast(events);
    prev = next;
    latest = tasks;
    lastOk = Date.now();
    lastError = null;
  } catch (err) {
    // Keep prev snapshot and last good task list; surface via /api/health.
    lastError = String(err);
    process.stderr.write(`[task-dashboard] poll error: ${err}\n`);
  }
}

/** Start the chained polling loop (no overlapping ticks). Returns a stop fn. */
export function startPoller(): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const loop = async () => {
    if (stopped) return;
    await tick();
    if (!stopped) timer = setTimeout(loop, POLL_INTERVAL_MS);
  };
  void loop();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
