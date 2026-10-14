import type { FastifyReply } from 'fastify';
import type { StreamEvent } from '../shared/types';

// Registry of connected SSE clients.
const clients = new Set<FastifyReply>();

export function addClient(reply: FastifyReply): void {
  clients.add(reply);
}

export function removeClient(reply: FastifyReply): void {
  clients.delete(reply);
}

export function clientCount(): number {
  return clients.size;
}

function write(reply: FastifyReply, payload: string): void {
  try {
    reply.raw.write(payload);
  } catch {
    clients.delete(reply);
  }
}

/** Send one event to a single client (used for the initial snapshot). */
export function sendTo(reply: FastifyReply, event: StreamEvent): void {
  write(reply, `data: ${JSON.stringify(event)}\n\n`);
}

/** Broadcast a batch of events to all connected clients. */
export function broadcast(events: StreamEvent[]): void {
  if (events.length === 0) return;
  for (const event of events) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const reply of clients) write(reply, payload);
  }
}

/** Keep connections alive through proxies. */
export function startHeartbeat(): NodeJS.Timeout {
  return setInterval(() => {
    for (const reply of clients) write(reply, ': ping\n\n');
  }, 20_000);
}
