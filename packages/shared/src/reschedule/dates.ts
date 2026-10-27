/** Date helpers on `YYYY-MM-DD` strings (dates have no time zone; CLAUDE.md). */

const asUtc = (date: string) => new Date(`${date}T00:00:00Z`);

/** `date` plus `days` (negative for earlier). */
export function addDays(date: string, days: number): string {
  const d = asUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  const day = asUtc(date).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Every date from `start` to `end`, both included. Empty when end is before start. */
export function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Whole days from `start` to `end` (0 when equal). */
export function daysBetween(start: string, end: string): number {
  return Math.round((asUtc(end).getTime() - asUtc(start).getTime()) / 86_400_000);
}

/** Monday of the week `date` falls in. */
export function weekStart(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/** Today's date in a time zone, e.g. todayIn(new Date(), 'Asia/Kolkata'). */
export function todayIn(now: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Minutes from midnight in a time zone, e.g. 600 for 10:00. */
export function minuteIn(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}
