import { describe, expect, it } from 'vitest';
import { demoPublishedTimetable } from '../fixtures';
import { feedEvents, icsCalendar, zonedToUtc } from './ical';
import { linkId, linkToken } from './links';
import type { CalendarPlace, PortalCalendar } from './days';
import type { PortalViewer, TodayInput } from './today';

const fixture = demoPublishedTimetable();
const sectionId = fixture.slots
  .map((s) => s.sectionIds)
  .reduce((acc, ids) => acc.filter((id) => ids.includes(id)))[0]!;
const place: CalendarPlace = { sectionId, cohortId: null, programmeId: null, departmentId: null };
const calendar: PortalCalendar = {
  workingDays: [1, 2, 3, 4, 5],
  termStart: '2026-07-20',
  termEnd: '2026-12-15',
  holidays: [
    {
      name: 'Independence Day',
      startDate: '2026-08-15',
      endDate: '2026-08-15',
      scopeType: 'institute',
      scopeId: null,
      changedAt: new Date(),
    },
    {
      name: 'Section trip, day 1',
      startDate: '2026-08-11',
      endDate: '2026-08-11',
      scopeType: 'section',
      scopeId: sectionId,
      changedAt: new Date(),
    },
  ],
  extraDays: [],
  places: new Map([[sectionId, place]]),
};
const viewer: PortalViewer = {
  kind: 'student',
  id: '5e000000-0000-4000-8000-000000000001',
  name: 'Test Student',
  groupLabel: 'CS A',
  place,
  electiveSectionIds: [],
};
const input: TodayInput = {
  viewer,
  timezone: 'Asia/Kolkata',
  date: '2026-08-10',
  now: { date: '2026-08-10', minute: 0 },
  slots: fixture.slots,
  calendar,
};
const ID = '0b5c9a52-3d2f-4c7e-9b51-7a2b3c4d5e6f';

describe('signed links', () => {
  it('round-trips, and rejects edits, other purposes and other secrets', () => {
    const token = linkToken('ical', ID, 'secret');
    expect(linkId('ical', token, 'secret')).toBe(ID);
    expect(linkId('ical', `${token}.ics`, 'secret')).toBe(ID);
    expect(linkId('public', token, 'secret')).toBeNull();
    expect(linkId('ical', token, 'other')).toBeNull();
    expect(linkId('ical', `${ID}.AAAAAAAAAAAAAAAAAAAAAA`, 'secret')).toBeNull();
    expect(linkId('ical', 'not-a-token', 'secret')).toBeNull();
  });
});

describe('calendar feed', () => {
  it('converts institute time to UTC', () => {
    expect(zonedToUtc('2026-08-10', 9 * 60, 'Asia/Kolkata').toISOString()).toBe(
      '2026-08-10T03:30:00.000Z',
    );
    // Daylight saving elsewhere: 09:00 in London in August is 08:00 UTC.
    expect(zonedToUtc('2026-08-10', 9 * 60, 'Europe/London').toISOString()).toBe(
      '2026-08-10T08:00:00.000Z',
    );
  });

  it('lists the week as timed events, a holiday as an all-day event, and cancellations', () => {
    const events = feedEvents(input, '2026-08-10', '2026-08-16');
    const weekdaySlots = fixture.slots.filter((s) => s.weekday <= 5).length;
    // Saturday 15 Aug is a holiday (no classes on Saturdays anyway).
    expect(events.filter((e) => e.start)).toHaveLength(weekdaySlots);
    const holiday = events.find((e) => e.summary === 'Holiday: Independence Day')!;
    expect(holiday).toMatchObject({ start: null, date: '2026-08-15' });
    const tuesday = events.filter((e) => e.date === '2026-08-11' && e.start);
    expect(tuesday.length).toBeGreaterThan(0);
    expect(tuesday.every((e) => e.cancelled && e.summary.startsWith('Cancelled: '))).toBe(true);
  });

  it('writes valid iCalendar text: CRLF, escaped commas, folded long lines', () => {
    const events = feedEvents(input, '2026-08-10', '2026-08-11');
    const ics = icsCalendar('Slotwise, CS A', events, new Date('2026-08-01T00:00:00Z'));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('X-WR-CALNAME:Slotwise\\, CS A');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).toContain('DTSTAMP:20260801T000000Z');
    expect(ics.split('\r\n').every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(events.length);
  });
});
