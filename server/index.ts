import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import type {
  CollectionInfo,
  PersonInfo,
  SortDir,
  SortField,
  Task,
  TaskStatus,
} from '../shared/types';
import { requireViewer } from './auth';
import { AUTH_MODE, HOST, PORT, SERVICE_URL, STATIC_DIR } from './config';
import { getLatestTasks, getPollState, startPoller } from './poller';
import { addClient, clientCount, removeClient, sendTo, startHeartbeat } from './sse';

const app = Fastify({ logger: false });
// Only needed when the SPA is served from another origin during local dev;
// behind IAP the page and API share one origin.
if (AUTH_MODE === 'local') await app.register(cors, { origin: true });
app.addHook(
  'onRequest',
  requireViewer(() => {
    const reader = getPollState().reader;
    return reader ? { email: reader.email, username: reader.username } : null;
  }),
);

function asArray(v: unknown): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? (v as string[]) : [String(v)];
}

function deriveCollections(tasks: Task[]): {
  collections: CollectionInfo[];
  projects: string[];
  people: PersonInfo[];
} {
  const byCollection = new Map<string, CollectionInfo>();
  const projects = new Set<string>();
  const people = new Map<string, PersonInfo>();
  for (const t of tasks) {
    let person = people.get(t.owner);
    if (!person) {
      person = { name: t.owner, taskCount: 0, openCount: 0 };
      people.set(t.owner, person);
    }
    person.taskCount++;
    if (t.status !== 'complete') person.openCount++;

    let info = byCollection.get(t.collection);
    if (!info) {
      info = { name: t.collection, taskCount: 0, projects: [] };
      byCollection.set(t.collection, info);
    }
    info.taskCount++;
    if (t.project) {
      projects.add(t.project);
      if (!info.projects.includes(t.project)) info.projects.push(t.project);
    }
  }
  return {
    collections: [...byCollection.values()].sort((a, b) => a.name.localeCompare(b.name)),
    projects: [...projects].sort(),
    people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function sortTasks(tasks: Task[], field: SortField, dir: SortDir): Task[] {
  const f = field === 'due' ? (t: Task) => t.due_date : (t: Task) => t.created_at;
  const mult = dir === 'asc' ? 1 : -1;
  return [...tasks].sort((a, b) => {
    const av = f(a);
    const bv = f(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // nulls always last
    if (bv == null) return -1;
    return (av - bv) * mult;
  });
}

// Liveness probe (Cloud Run's probes reach the container directly, not via IAP).
app.get('/healthz', async () => ({ ok: true }));

/** The signed-in viewer (null locally until the first poll identifies you). */
app.get('/api/me', async (req) => ({ viewer: req.viewer ?? null, authMode: AUTH_MODE }));

// Health comes from the poll loop rather than a live call, so browsers polling
// /api/health don't spend the user's service rate limit.
app.get('/api/health', async () => {
  const state = getPollState();
  return {
    service: SERVICE_URL,
    serviceOk: state.lastOk > 0 && !state.lastError,
    ...state,
    clients: clientCount(),
  };
});

app.get('/api/collections', async () => deriveCollections(getLatestTasks()));

app.get('/api/tasks', async (req) => {
  const q = req.query as Record<string, unknown>;
  let tasks = getLatestTasks();

  const statuses = asArray(q.status) as TaskStatus[];
  const all = q.all === 'true' || q.all === true;
  const open = q.open === undefined ? true : q.open === 'true' || q.open === true;
  const project = q.project ? String(q.project) : null;
  const collections = asArray(q.collection);
  const owner = q.owner ? String(q.owner) : null;
  const sort = (q.sort === 'due' ? 'due' : 'created') as SortField;
  const dir = (q.dir === 'asc' ? 'asc' : 'desc') as SortDir;

  if (statuses.length > 0) {
    tasks = tasks.filter((t) => statuses.includes(t.status));
  } else if (!all && open) {
    tasks = tasks.filter((t) => t.status !== 'complete');
  }
  if (project) tasks = tasks.filter((t) => t.project === project);
  if (collections.length > 0) tasks = tasks.filter((t) => collections.includes(t.collection));
  if (owner) tasks = tasks.filter((t) => t.owner === owner);

  return { tasks: sortTasks(tasks, sort, dir) };
});

app.get('/api/stream', (req, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  // Full reseed on (re)connect — also covers EventSource auto-reconnect.
  sendTo(reply, { type: 'snapshot', tasks: getLatestTasks() });
  addClient(reply);
  req.raw.on('close', () => removeClient(reply));
});

// The built SPA, behind the same viewer hook as the API. Unknown non-API
// paths get index.html so client-side state survives a reload.
const staticRoot = resolve(STATIC_DIR);
if (existsSync(staticRoot)) {
  await app.register(fastifyStatic, { root: staticRoot, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.method !== 'GET' || req.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply.sendFile('index.html');
  });
}

const stopPoller = startPoller();
const heartbeat = startHeartbeat();

app.listen({ port: PORT, host: HOST }).then(() => {
  process.stderr.write(`[task-dashboard] server on http://localhost:${PORT}\n`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    stopPoller();
    clearInterval(heartbeat);
    app.close().then(() => process.exit(0));
  });
}
