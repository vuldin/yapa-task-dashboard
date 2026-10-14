import { useViewer } from '@/hooks/useViewer';
import { fetchHealth } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useQuery } from '@tanstack/react-query';

export function StreamStatus({ connected }: { connected: boolean }) {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 5000,
  });
  const viewer = useViewer();
  // Before the first successful poll there is nothing to show but the error.
  const serviceDown = health && !health.serviceOk && health.lastError && health.lastOk === 0;

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            connected ? 'bg-green-400' : 'bg-amber-400 animate-pulse',
          )}
        />
        {connected ? 'live' : 'reconnecting'}
      </span>
      {viewer && (
        <span
          className="text-slate-500"
          title={
            health?.reader ? `reading ${health.service} as ${health.reader.username}` : undefined
          }
        >
          {viewer.email}
        </span>
      )}
      {serviceDown && (
        <span
          className="rounded bg-red-900 px-2 py-0.5 text-red-200"
          title={health.lastError ?? ''}
        >
          YAPA service unreachable
        </span>
      )}
      {health?.lastError && !serviceDown && (
        <span className="rounded bg-amber-900 px-2 py-0.5 text-amber-200" title={health.lastError}>
          poll error
        </span>
      )}
    </div>
  );
}
