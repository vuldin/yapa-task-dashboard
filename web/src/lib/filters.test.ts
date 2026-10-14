import type { useUIStore } from '@/store/ui-store';
import type { Task, TaskPriority, TaskStatus } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { scopeFilter, tableFilter } from './filters';

type UI = ReturnType<typeof useUIStore.getState>;

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    collection: 'customer-acme',
    title: id,
    notes: '',
    tags: [],
    status: 'pending' as TaskStatus,
    priority: 'medium' as TaskPriority,
    due_date: null,
    customer: null,
    project: null,
    created_at: 1,
    updated_at: 1,
    completed_at: null,
    duration_minutes: null,
    salience: null,
    owner: 'alice',
    last_editor: null,
    ...over,
  };
}

function ui(over: Partial<UI> = {}): UI {
  return {
    view: 'all',
    statuses: [],
    collections: [],
    owner: null,
    minPriority: null,
    sortField: 'created',
    sortDir: 'asc',
    ...over,
  } as UI;
}

const ids = (ts: Task[]) => ts.map((t) => t.id);

const tasks = [
  task('crit', { priority: 'critical', collection: 'customer-acme' }),
  task('high', { priority: 'high', collection: 'project-x' }),
  task('med', { priority: 'medium', collection: 'customer-zeta', owner: 'bob' }),
  task('low', { priority: 'low', collection: 'project-x', status: 'complete' }),
];

describe('scopeFilter', () => {
  it('no filters keeps everything', () => {
    expect(ids(scopeFilter(tasks, ui()))).toEqual(['crit', 'high', 'med', 'low']);
  });

  it('minimum priority keeps that level and above', () => {
    expect(ids(scopeFilter(tasks, ui({ minPriority: 'high' })))).toEqual(['crit', 'high']);
    expect(ids(scopeFilter(tasks, ui({ minPriority: 'critical' })))).toEqual(['crit']);
    expect(ids(scopeFilter(tasks, ui({ minPriority: 'medium' })))).toEqual(['crit', 'high', 'med']);
  });

  it('multiple collections are OR-ed; empty means all', () => {
    expect(
      ids(scopeFilter(tasks, ui({ collections: ['customer-acme', 'customer-zeta'] }))),
    ).toEqual(['crit', 'med']);
    expect(ids(scopeFilter(tasks, ui({ collections: ['project-x'] })))).toEqual(['high', 'low']);
  });

  it('filters combine (AND across kinds)', () => {
    const s = ui({ collections: ['project-x', 'customer-zeta'], minPriority: 'medium' });
    expect(ids(scopeFilter(tasks, s))).toEqual(['high', 'med']);
    expect(ids(scopeFilter(tasks, { ...s, owner: 'bob' }))).toEqual(['med']);
  });
});

describe('tableFilter', () => {
  it('the Open view drops completed tasks after the scope filters', () => {
    expect(ids(tableFilter(tasks, ui({ view: 'open', collections: ['project-x'] })))).toEqual([
      'high',
    ]);
  });

  it('sorts by due date with unset dates last', () => {
    const dated = [task('a', { due_date: 30 }), task('b'), task('c', { due_date: 10 })];
    expect(ids(tableFilter(dated, ui({ sortField: 'due', sortDir: 'asc' })))).toEqual([
      'c',
      'a',
      'b',
    ]);
    expect(ids(tableFilter(dated, ui({ sortField: 'due', sortDir: 'desc' })))).toEqual([
      'a',
      'c',
      'b',
    ]);
  });
});
