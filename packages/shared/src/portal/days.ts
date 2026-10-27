/**
 * Which classes run on a date, and which are cancelled by a holiday: the published week
 * (timetable-read.v1) laid onto the academic calendar. Pure; the API loads the rows.
 */
import type { TimetableSlotV1, TodayClassV1 } from '../contracts';
import { addDays, isoWeekday } from './calendar';

export type CalendarScope = 'institute' | 'department' | 'programme' | 'cohort' | 'section';

/** Where a section sits, for matching calendar entries scoped to a department, programme… */
export interface CalendarPlace {
  sectionId: string | null;
  cohortId: string | null;
  programmeId: string | null;
  departmentId: string | null;
}

export interface PortalHoliday {
  name: string;
  startDate: string;
  /** Inclusive. */
  endDate: string;
  scopeType: CalendarScope;
  /** Department, programme, cohort or section id; null for the whole institute. */
  scopeId: string | null;
  /** Last change, for ordering the changes list (newest first). */
  changedAt: Date;
}

/** A non-working day (or a swapped day) that runs another weekday's timetable. */
export interface PortalExtraDay {
  date: string;
  followsWeekday: number;
  scopeType: CalendarScope;
  scopeId: string | null;
}

export interface PortalCalendar {
  /** ISO weekdays with classes, from the bell schedule. */
  workingDays: readonly number[];
  /** Term dates; no classes outside them. */
  termStart: string;
  termEnd: string;
  holidays: readonly PortalHoliday[];
  extraDays: readonly PortalExtraDay[];
  /** Section id → its place, for classes' audiences. */
  places: ReadonlyMap<string, CalendarPlace>;
}

const PLACE_KEY: Record<Exclude<CalendarScope, 'institute'>, keyof CalendarPlace> = {
  department: 'departmentId',
  programme: 'programmeId',
  cohort: 'cohortId',
  section: 'sectionId',
};

/** True if a calendar entry with this scope applies to the place. */
export function scopeCovers(
  entry: { scopeType: CalendarScope; scopeId: string | null },
  place: CalendarPlace,
): boolean {
  if (entry.scopeType === 'institute') return true;
  const value = place[PLACE_KEY[entry.scopeType]];
  return value != null && value === entry.scopeId;
}

function onDate(holiday: PortalHoliday, date: string): boolean {
  return holiday.startDate <= date && date <= holiday.endDate;
}

/** The holiday that covers every one of these places on the date, if any. */
export function holidayFor(
  calendar: PortalCalendar,
  date: string,
  places: readonly CalendarPlace[],
): PortalHoliday | null {
  if (places.length === 0) return null;
  return (
    calendar.holidays.find(
      (h) => onDate(h, date) && places.every((place) => scopeCovers(h, place)),
    ) ?? null
  );
}

/**
 * The weekday whose timetable runs on the date for these places: an extra working day's
 * weekday, else the date's own weekday if it is a working day, else null (no classes).
 */
export function runsWeekday(
  calendar: PortalCalendar,
  date: string,
  places: readonly CalendarPlace[],
): number | null {
  if (date < calendar.termStart || date > calendar.termEnd) return null;
  const extra = calendar.extraDays.find(
    (d) => d.date === date && places.some((place) => scopeCovers(d, place)),
  );
  if (extra) return extra.followsWeekday;
  const weekday = isoWeekday(date);
  return calendar.workingDays.includes(weekday) ? weekday : null;
}

/** The sections attending a class, as places (unknown sections still count, unscoped). */
export function slotPlaces(calendar: PortalCalendar, slot: TimetableSlotV1): CalendarPlace[] {
  return slot.sectionIds.map(
    (id) =>
      calendar.places.get(id) ?? {
        sectionId: id,
        cohortId: null,
        programmeId: null,
        departmentId: null,
      },
  );
}

export interface DayOptions {
  /**
   * Who the class is for, from the viewer's side: a student's own section only (a holiday
   * for another section in a combined class doesn't cancel theirs); for a teacher every
   * section attending (the class is off only when all of them are on holiday).
   */
  audience: (slot: TimetableSlotV1) => CalendarPlace[];
  /** "with whom" line: teachers for students, the group for teachers. */
  withWhom: (slot: TimetableSlotV1) => string;
}

/** The viewer's classes on a date, in time order, holiday cancellations included. */
export function classesOn(
  calendar: PortalCalendar,
  slots: readonly TimetableSlotV1[],
  date: string,
  options: DayOptions,
): TodayClassV1[] {
  const classes: TodayClassV1[] = [];
  for (const slot of slots) {
    const places = options.audience(slot);
    if (runsWeekday(calendar, date, places) !== slot.weekday) continue;
    const holiday = holidayFor(calendar, date, places);
    classes.push({
      id: slot.id,
      kind: 'regular',
      cancelled: holiday !== null,
      cancelReason: holiday?.name ?? null,
      startPeriodIndex: slot.startPeriodIndex,
      length: slot.length,
      startMinute: slot.startMinute,
      endMinute: slot.endMinute,
      component: slot.component,
      courseCode: slot.course.code,
      courseShortName: slot.course.shortName,
      courseTitle: slot.course.title,
      roomCode: slot.room?.code ?? null,
      withWhom: options.withWhom(slot),
    });
  }
  return classes.sort(
    (a, b) => a.startMinute - b.startMinute || a.courseCode.localeCompare(b.courseCode),
  );
}

/** Dates from `from` to `to`, inclusive. */
export function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  return dates;
}
