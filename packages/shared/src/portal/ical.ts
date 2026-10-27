/**
 * Calendar feed (iCalendar, RFC 5545) of a person's classes, for Google Calendar and phone
 * calendars (CLAUDE.md "Calendar subscription"). Times are written in UTC so every app agrees.
 */
import type { TodayClassV1 } from '../contracts';
import { addDays } from './calendar';
import { classesOn, dateRange, holidayFor } from './days';
import { viewerOptions, viewerSlots, type TodayInput } from './today';

/** Offset of a time zone from UTC at an instant, in minutes (Asia/Kolkata → 330). */
function offsetMinutes(timezone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** The instant of a local date + minutes-from-midnight in a time zone. */
export function zonedToUtc(date: string, minute: number, timezone: string): Date {
  const naive = Date.parse(`${date}T00:00:00Z`) + minute * 60_000;
  let guess = new Date(naive - offsetMinutes(timezone, new Date(naive)) * 60_000);
  // Second pass settles days when the offset changes (daylight saving elsewhere).
  guess = new Date(naive - offsetMinutes(timezone, guess) * 60_000);
  return guess;
}

function stamp(at: Date): string {
  return at
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** Escapes text values (RFC 5545 3.3.11). */
function text(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Folds lines longer than 75 octets (RFC 5545 3.1). */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let start = 0;
  let width = 75;
  while (start < bytes.length) {
    let end = Math.min(start + width, bytes.length);
    // Never split a UTF-8 character.
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end -= 1;
    out.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    width = 74; // continuation lines start with a space
  }
  return out.join('\r\n ');
}

export interface FeedEvent {
  uid: string;
  summary: string;
  description: string;
  location: string | null;
  /** Timed event, or an all-day event on `date`. */
  start: Date | null;
  end: Date | null;
  date: string;
  cancelled: boolean;
}

const COMPONENT: Record<TodayClassV1['component'], string> = {
  lecture: 'Lecture',
  tutorial: 'Tutorial',
  practical: 'Lab',
};

/** Days before today the feed still includes (so this week stays complete). */
export const FEED_DAYS_BEFORE = 7;
/** Days after today the feed reaches (capped at the term's end). */
export const FEED_DAYS_AFTER = 120;

/** The viewer's classes and holidays from `from` to `to` as calendar events. */
export function feedEvents(input: TodayInput, from: string, to: string): FeedEvent[] {
  const options = viewerOptions(input.viewer, input.calendar);
  const slots = viewerSlots(input.viewer, input.slots);
  const events: FeedEvent[] = [];
  const holidays = new Set<string>();
  for (const date of dateRange(from, to)) {
    const holiday = holidayFor(input.calendar, date, [input.viewer.place]);
    if (holiday && !holidays.has(`${holiday.name}|${date}`)) {
      holidays.add(`${holiday.name}|${date}`);
      events.push({
        uid: `holiday-${date}-${holiday.name.replace(/\W+/g, '-').toLowerCase()}`,
        summary: `Holiday: ${holiday.name}`,
        description: 'No classes.',
        location: null,
        start: null,
        end: null,
        date,
        cancelled: false,
      });
    }
    for (const c of classesOn(input.calendar, slots, date, options)) {
      events.push({
        uid: `${c.id}-${date}`,
        summary: `${c.cancelled ? 'Cancelled: ' : ''}${c.courseShortName} (${COMPONENT[c.component]})`,
        description: [
          `${c.courseCode} ${c.courseTitle}`,
          c.withWhom,
          c.cancelled && c.cancelReason ? `Cancelled: ${c.cancelReason}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        location: c.roomCode,
        start: zonedToUtc(date, c.startMinute, input.timezone),
        end: zonedToUtc(date, c.endMinute, input.timezone),
        date,
        cancelled: c.cancelled,
      });
    }
  }
  return events;
}

/** The whole `.ics` file. `now` stamps DTSTAMP. */
export function icsCalendar(name: string, events: readonly FeedEvent[], now: Date): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Slotwise//Timetable//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${text(name)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@slotwise`, `DTSTAMP:${stamp(now)}`);
    if (e.start && e.end) {
      lines.push(`DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end)}`);
    } else {
      lines.push(
        `DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`,
        `DTEND;VALUE=DATE:${addDays(e.date, 1).replace(/-/g, '')}`,
        'TRANSP:TRANSPARENT',
      );
    }
    lines.push(`SUMMARY:${text(e.summary)}`, `DESCRIPTION:${text(e.description)}`);
    if (e.location) lines.push(`LOCATION:${text(e.location)}`);
    if (e.cancelled) lines.push('STATUS:CANCELLED');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
