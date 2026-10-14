import { fetchMe } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

/** The signed-in viewer; refetched now and then so an expired session is noticed. */
export function useViewer() {
  const { data } = useQuery({ queryKey: ['me'], queryFn: fetchMe, refetchInterval: 60_000 });
  return data?.viewer ?? null;
}
