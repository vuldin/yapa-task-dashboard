import { endOfISOWeek, format, getISOWeek, getISOWeekYear, startOfISOWeek } from 'date-fns';

/**
 * ISO-week bucket key for a unix timestamp, in the host's LOCAL timezone
 * (date-fns operates on local-time Date objects). e.g. "2026-W22".
 */
export function isoWeekKey(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`;
}

/** Human label for the ISO week containing a timestamp, e.g. "May 26–Jun 1". */
export function weekRangeLabel(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const s = startOfISOWeek(d);
  const e = endOfISOWeek(d);
  return s.getMonth() === e.getMonth()
    ? `${format(s, 'MMM d')}–${format(e, 'd')}`
    : `${format(s, 'MMM d')}–${format(e, 'MMM d')}`;
}
