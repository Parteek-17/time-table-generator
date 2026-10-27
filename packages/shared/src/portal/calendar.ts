/**
 * Date helpers for the portals. Dates are `YYYY-MM-DD` strings without a time zone and times
 * are minutes from midnight in the institute's time zone (CLAUDE.md "Data model essentials").
 */

const DAY_MS = 86_400_000;

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** `YYYY-MM-DD` of a Date read in UTC (dates from Postgres `date` columns come back as UTC midnight). */
export function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** The date `days` after (or before, when negative) `date`. */
export function addDays(date: string, days: number): string {
  return isoDate(new Date(toUtc(date).getTime() + days * DAY_MS));
}

/** ISO weekday of a date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  const day = toUtc(date).getUTCDay();
  return day === 0 ? 7 : day;
}

/** The Monday of the week `date` is in. */
export function weekStartOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/** Today's date and the minute of the day in a time zone, e.g. `Asia/Kolkata`. */
export function localNow(
  timezone: string,
  now: Date = new Date(),
): { date: string; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minute: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** "Mon 12 Oct", for plain-language change messages. */
export function shortDay(date: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(toUtc(date));
}

/** "10:50" from minutes past midnight. */
export function clock(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
