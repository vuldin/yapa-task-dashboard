import type { StreamEvent, Task } from '@shared/types';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

const sameTask = (a: Task, b: { id: string; collection: string }) =>
  a.id === b.id && a.collection === b.collection;

/**
 * Single long-lived EventSource that patches the canonical ['tasks'] query
 * cache in place, so every connected view updates without a refetch.
 */
export function useTaskStream(): { connected: boolean } {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      const evt = JSON.parse(e.data) as StreamEvent;
      qc.setQueryData<Task[]>(['tasks'], (prev = []) => {
        switch (evt.type) {
          case 'snapshot':
            return evt.tasks;
          case 'upsert': {
            const i = prev.findIndex((t) => sameTask(t, evt.task));
            if (i === -1) return [...prev, evt.task];
            const copy = prev.slice();
            copy[i] = evt.task;
            return copy;
          }
          case 'remove':
            return prev.filter((t) => !sameTask(t, evt));
        }
      });
    };
    return () => es.close();
  }, [qc]);

  return { connected };
}
