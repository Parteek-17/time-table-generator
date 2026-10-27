/**
 * "Today" (portal-read.v1) and the week view, built from the viewer's published week and the
 * academic calendar. Pure; the API loads the rows (apps/api/src/portal).
 */
import { z } from 'zod';
import {
  Id,
  IsoDate,
  PORTAL_READ_V1,
  TodayClassV1,
  TodayV1,
  type TimetableSlotV1,
  type TodayChangeV1,
} from '../contracts';
import { addDays, clock, isoWeekday, shortDay, weekStartOf } from './calendar';
import {
  classesOn,
  dateRange,
  holidayFor,
  runsWeekday,
  slotPlaces,
  type CalendarPlace,
  type DayOptions,
  type PortalCalendar,
} from './days';

export type ViewerKind = TodayV1['viewer']['role'];

export interface PortalViewer {
  kind: ViewerKind;
  /** Student or faculty id. */
  id: string;
  name: string;
  /** Students: section, e.g. "CS A". Faculty: short code. */
  groupLabel: string;
  /**
   * Students: their section's place. Faculty: their home department only (an institute or
   * department holiday is a day off for them; a section's holiday cancels just its classes).
   */
  place: CalendarPlace;
  /** Students: elective sections they chose; empty = not recorded, show every elective. */
  electiveSectionIds: readonly string[];
}

/** How a viewer kind sees a class. A lookup, not a switch on the kind (no inline role checks). */
const VIEW: Record<ViewerKind, (viewer: PortalViewer, calendar: PortalCalendar) => DayOptions> = {
  student: (viewer) => ({
    audience: () => [viewer.place],
    withWhom: (slot) => slot.faculty.map((f) => f.name).join(', '),
  }),
  faculty: (_viewer, calendar) => ({
    audience: (slot) => slotPlaces(calendar, slot),
    withWhom: (slot) => slot.target.name,
  }),
};

/** The slots this viewer attends: a student's electives are narrowed to the ones they chose. */
export function viewerSlots(
  viewer: PortalViewer,
  slots: readonly TimetableSlotV1[],
): TimetableSlotV1[] {
  if (viewer.electiveSectionIds.length === 0) return [...slots];
  return slots.filter(
    (s) => s.target.kind !== 'elective_section' || viewer.electiveSectionIds.includes(s.target.id),
  );
}

export interface TodayInput {
  viewer: PortalViewer;
  timezone: string;
  /** The day shown. */
  date: string;
  /** Now in the institute's time zone. */
  now: { date: string; minute: number };
  /** The viewer's published week (timetable-read.v1 slots); empty when nothing is published. */
  slots: readonly TimetableSlotV1[];
  calendar: PortalCalendar;
}

/** Days ahead (after the day shown) whose changes are listed. */
export const CHANGES_DAYS_AHEAD = 7;

function dayHoliday(input: TodayInput, date: string): string | null {
  return holidayFor(input.calendar, date, [input.viewer.place])?.name ?? null;
}

/**
 * Changes for the day shown and the next 7 days: holidays for the viewer, and classes
 * cancelled for their section(s) on days that are not holidays for the viewer. Newest
 * first (by when the holiday was last changed), then by date.
 */
export function upcomingChanges(input: TodayInput): TodayChangeV1[] {
  const options = VIEW[input.viewer.kind](input.viewer, input.calendar);
  const slots = viewerSlots(input.viewer, input.slots);
  const found: { change: TodayChangeV1; at: number; date: string }[] = [];
  const seenHolidays = new Set<string>();
  for (const date of dateRange(input.date, addDays(input.date, CHANGES_DAYS_AHEAD))) {
    const holiday = holidayFor(input.calendar, date, [input.viewer.place]);
    if (holiday) {
      const key = `${holiday.name}|${holiday.startDate}`;
      if (!seenHolidays.has(key)) {
        seenHolidays.add(key);
        const days =
          holiday.startDate === holiday.endDate
            ? `on ${shortDay(holiday.startDate)}`
            : `from ${shortDay(holiday.startDate)} to ${shortDay(holiday.endDate)}`;
        found.push({
          change: {
            kind: 'holiday',
            message: `No classes ${days}: ${holiday.name}`,
            classId: null,
          },
          at: holiday.changedAt.getTime(),
          date,
        });
      }
      continue;
    }
    for (const c of classesOn(input.calendar, slots, date, options)) {
      if (!c.cancelled) continue;
      const cause = input.calendar.holidays.find((h) => h.name === c.cancelReason);
      found.push({
        change: {
          kind: 'cancelled',
          message: `${c.courseCode} ${c.courseShortName} (${c.withWhom}) on ${shortDay(date)} at ${clock(c.startMinute)} is cancelled: ${c.cancelReason}`,
          classId: c.id,
        },
        at: cause?.changedAt.getTime() ?? 0,
        date,
      });
    }
  }
  return found.sort((a, b) => b.at - a.at || a.date.localeCompare(b.date)).map((f) => f.change);
}

/** Next class that is not cancelled and not over yet; null on past days. */
function nextClassId(input: TodayInput, classes: readonly TodayClassV1[]): string | null {
  if (input.date < input.now.date) return null;
  const from = input.date === input.now.date ? input.now.minute : -1;
  return classes.find((c) => !c.cancelled && c.endMinute > from)?.id ?? null;
}

/** portal-read.v1 "Today". */
export function buildToday(input: TodayInput): TodayV1 {
  const options = VIEW[input.viewer.kind](input.viewer, input.calendar);
  const classes = classesOn(
    input.calendar,
    viewerSlots(input.viewer, input.slots),
    input.date,
    options,
  );
  return TodayV1.parse({
    contract: PORTAL_READ_V1,
    date: input.date,
    timezone: input.timezone,
    viewer: {
      role: input.viewer.kind,
      id: input.viewer.id,
      name: input.viewer.name,
      groupLabel: input.viewer.groupLabel,
    },
    holiday: dayHoliday(input, input.date),
    nextClassId: nextClassId(input, classes),
    classes,
    changes: upcomingChanges(input),
    // P6's seats are not readable yet (milestone 4).
    examSeat: null,
  });
}

export const PortalDayV1 = z.object({
  /** The date. */
  date: IsoDate,
  /** ISO weekday of the date. */
  weekday: z.int().min(1).max(7),
  /** True when it is a teaching day for the viewer (working day or extra working day). */
  teaching: z.boolean(),
  /** Holiday name, or null. */
  holiday: z.string().nullable(),
  /** Classes in time order, cancelled ones included. */
  classes: z.array(TodayClassV1),
});

/** `GET /portal/week?date=`: Monday to Sunday of the week containing the date. P5 only. */
export const PortalWeekV1 = z.object({
  /** Monday. */
  weekStart: IsoDate,
  /** Today in the institute's time zone (to highlight it). */
  today: IsoDate,
  /** Institute time zone. */
  timezone: z.string(),
  /** Who is looking (same as TodayV1.viewer). */
  viewer: TodayV1.shape.viewer,
  /** Days that are teaching days, holidays, or have classes; other days are left out. */
  days: z.array(PortalDayV1),
  /** The published version shown, or null when nothing is published. */
  versionId: Id.nullable(),
});
export type PortalDayV1 = z.infer<typeof PortalDayV1>;
export type PortalWeekV1 = z.infer<typeof PortalWeekV1>;

export const PORTAL_WEEK_ROUTE = '/portal/week' as const;

/** The week view for the week containing `input.date`. */
export function buildWeek(input: TodayInput & { versionId: string | null }): PortalWeekV1 {
  const options = VIEW[input.viewer.kind](input.viewer, input.calendar);
  const slots = viewerSlots(input.viewer, input.slots);
  const weekStart = weekStartOf(input.date);
  const days: PortalDayV1[] = [];
  for (const date of dateRange(weekStart, addDays(weekStart, 6))) {
    const classes = classesOn(input.calendar, slots, date, options);
    const holiday = dayHoliday(input, date);
    const teaching = runsWeekday(input.calendar, date, [input.viewer.place]) !== null;
    if (!teaching && !holiday && classes.length === 0) continue;
    days.push({ date, weekday: isoWeekday(date), teaching, holiday, classes });
  }
  return PortalWeekV1.parse({
    weekStart,
    today: input.now.date,
    timezone: input.timezone,
    viewer: {
      role: input.viewer.kind,
      id: input.viewer.id,
      name: input.viewer.name,
      groupLabel: input.viewer.groupLabel,
    },
    days,
    versionId: input.versionId,
  });
}

/** Query of `GET /portal/today` and `GET /portal/week`: the day (default: today). */
export const PortalDateQuery = z.object({
  /** `YYYY-MM-DD`; default today in the institute's time zone. */
  date: IsoDate.optional(),
});
export type PortalDateQuery = z.infer<typeof PortalDateQuery>;

/** What the portal offers each viewer kind besides their timetable. A lookup, not a role check. */
export const VIEWER_EXTRAS: Record<ViewerKind, { availability: boolean }> = {
  student: { availability: false },
  faculty: { availability: true },
};
