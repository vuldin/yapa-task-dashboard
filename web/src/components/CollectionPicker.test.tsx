// @vitest-environment jsdom
import { useUIStore } from '@/store/ui-store';
import type { Task } from '@shared/types';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionPicker } from './CollectionPicker';

const t = (collection: string, status: Task['status'] = 'pending') =>
  ({ id: `${collection}-${status}-${Math.random()}`, collection, status }) as Task;

const tasks: Task[] = [
  t('customer-acme'),
  t('customer-acme'),
  t('customer-zeta'),
  t('customer-zeta', 'complete'),
  t('project-x'),
];

vi.mock('@/hooks/useTasks', () => ({ useTasks: () => ({ data: tasks }) }));

const trigger = () => screen.getByRole('button', { name: /collection/i });
const open = () => fireEvent.click(trigger());
const box = (name: string) => screen.getByRole('checkbox', { name: new RegExp(`^${name}`) });

beforeEach(() => useUIStore.setState({ collections: [] }));
afterEach(cleanup);

describe('CollectionPicker', () => {
  it('lists collections from the live tasks with open counts', () => {
    render(<CollectionPicker />);
    expect(screen.getByRole('button', { name: /All collections/ })).toBeTruthy();
    open();
    const rows = screen.getAllByRole('checkbox').map((c) => c.closest('label')?.textContent);
    expect(rows).toEqual(['customer-acme2 open', 'customer-zeta1 open', 'project-x1 open']);
  });

  it('toggles collections and summarizes the selection', () => {
    render(<CollectionPicker />);
    open();
    fireEvent.click(box('customer-zeta'));
    expect(useUIStore.getState().collections).toEqual(['customer-zeta']);
    expect(screen.getByRole('button', { name: /^customer-zeta/ })).toBeTruthy();
    fireEvent.click(box('project-x'));
    expect(screen.getByRole('button', { name: /2 collections/ })).toBeTruthy();
    fireEvent.click(box('customer-zeta'));
    expect(useUIStore.getState().collections).toEqual(['project-x']);
  });

  it('search narrows the list', () => {
    render(<CollectionPicker />);
    open();
    fireEvent.change(screen.getByPlaceholderText('Search collections'), {
      target: { value: 'ZETA' },
    });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.change(screen.getByPlaceholderText('Search collections'), {
      target: { value: 'nope' },
    });
    expect(screen.getByText('No matching collections.')).toBeTruthy();
  });

  it('group shortcuts add every match; Clear empties', () => {
    render(<CollectionPicker />);
    open();
    fireEvent.click(box('project-x'));
    fireEvent.click(screen.getByRole('button', { name: '+ Customers' }));
    expect([...useUIStore.getState().collections].sort()).toEqual([
      'customer-acme',
      'customer-zeta',
      'project-x',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(useUIStore.getState().collections).toEqual([]);
  });

  it('Escape and outside clicks close the popover', () => {
    render(<CollectionPicker />);
    open();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(3);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    open();
    fireEvent.mouseDown(document.body);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });
});
