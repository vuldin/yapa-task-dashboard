import { fetchTasks } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

export function useTasks() {
  return useQuery({ queryKey: ['tasks'], queryFn: fetchTasks });
}
