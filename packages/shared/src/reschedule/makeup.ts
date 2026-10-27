/**
 * Make-up finder (CLAUDE.md "Rescheduling"): a replacement slot for a cancelled class that is
 * free for its sections, its teachers and a suitable room — searching the cancelled class's
 * week first, then the next. Pure; the API gathers the inputs from the setup snapshot, the
 * published timetable and P4's own cancellations and make-ups.
 */
import { z } from 'zod';
import { Id, IsoDate, PeriodIndex, type TimetableSlotV1 } from '../contracts';
import {
  classMeetsOn,
  dayOffOn,
  isTeachingDay,
  timetableWeekday,
  type RescheduleCalendar,
  type VersionWindow,
} from './calendar';
import { addDays, eachDate, weekStart } from './dates';
import { disruptionCoversSlot, overlapsHours, type DisruptionMatch } from './disruption';

/** Longest break a lab block may run across (CLAUDE.md: never span a break ≥ 30 minutes). */
export const LONG_BREAK_MINUTES = 30;

export interface BellPeriod {
  index: number;
  label: string;
  startMinute: number;
  endMinute: number;
}

export interface MakeUpBell {
  workingDays: readonly number[];
  periods: readonly BellPeriod[];
  breaks: readonly { afterPeriodIndex: number; minutes: number }[];
}

export interface MakeUpRoom {
  id: string;
  code: string;
  capacity: number;
}

export interface MakeUpTeacher {
  id: string;
  name: string;
  maxPeriodsPerDay: number;
  /** Cells they cannot teach. */
  unavailable: readonly { weekday: number; periodIndex: number }[];
}

/** A make-up already booked (it occupies its sections, teachers and room). */
export interface BookedMakeUp {
  id: string;
  date: string;
  startMinute: number;
  endMinute: number;
  length: number;
  roomId: string;
  sectionIds: readonly string[];
  facultyIds: readonly string[];
}

/** Everything around the class: who is busy when, from the published week and P4's own data. */
export interface MakeUpWorld {
  cal: RescheduleCalendar;
  version: VersionWindow;
  /** Every published class of the institute (rooms and teachers are shared). */
  slots: readonly TimetableSlotV1[];
  /** Cancelled classes ("slotId date"): they free their sections, teachers and room. */
  cancelled: ReadonlySet<string>;
  makeUps: readonly BookedMakeUp[];
  /** Active holidays, events and leave: nobody they cover can have a make-up then. */
  disruptions: readonly DisruptionMatch[];
}

export interface MakeUpRequest {
  /** The cancelled class and its date. */
  slot: TimetableSlotV1;
  date: string;
  bell: MakeUpBell;
  teachers: readonly MakeUpTeacher[];
  /** Rooms of the right type and size, best first (original room, home room, smallest). */
  rooms: readonly MakeUpRoom[];
  /** Today and the minute now, in the institute's time zone: nothing earlier is offered. */
  today: string;
  nowMinute: number;
  /** A make-up being moved: its own booking is not a clash. */
  ignoreMakeUpId?: string;
}

export interface MakeUpOption {
  date: string;
  /** same = the cancelled class's week (or this week, if that is over); next = the week after. */
  week: 'same' | 'next';
  startPeriodIndex: number;
  length: number;
  startMinute: number;
  endMinute: number;
  /** e.g. "P3" or "P5–P6". */
  periodLabel: string;
  roomId: string;
  roomCode: string;
}

export type MakeUpProblem =
  | 'no_teaching_day'
  | 'class_busy'
  | 'teacher_busy'
  | 'teacher_unavailable'
  | 'teacher_day_full'
  | 'no_room';

export interface MakeUpSearch {
  options: MakeUpOption[];
  /** Why nothing was found (the most common blocker), when options is empty. */
  problem: MakeUpProblem | null;
}

/** Book a make-up: the date, first period and room chosen from the options. */
export const BookMakeUpInput = z.object({
  date: IsoDate,
  startPeriodIndex: PeriodIndex,
  roomId: Id,
});
export type BookMakeUpInput = z.infer<typeof BookMakeUpInput>;

/** Weeks searched: the cancelled class's week (or this week, if it is over), then the next. */
export function searchWeeks(date: string, today: string): { same: string; next: string } {
  const own = weekStart(date);
  const now = weekStart(today);
  const same = own > now ? own : now;
  return { same, next: addDays(same, 7) };
}

/** Free (date, periods, room) choices, same week first, then by date and period. */
export function findMakeUps(req: MakeUpRequest, world: MakeUpWorld, limit = 8): MakeUpSearch {
  const { same, next } = searchWeeks(req.date, req.today);
  const counts = new Map<MakeUpProblem, number>();
  const options: MakeUpOption[] = [];
  for (const date of eachDate(same, addDays(next, 6))) {
    for (const start of blockStarts(req.bell, req.slot.length)) {
      const result = checkChoice(req, world, date, start);
      if ('problem' in result) {
        counts.set(result.problem, (counts.get(result.problem) ?? 0) + 1);
        continue;
      }
      options.push({ ...result.option, week: date < next ? 'same' : 'next' });
      if (options.length >= limit) return { options, problem: null };
    }
  }
  if (options.length > 0) return { options, problem: null };
  // The blocker that came closest: rooms only matter once class and teacher are free.
  const order: MakeUpProblem[] = [
    'no_room',
    'teacher_day_full',
    'teacher_unavailable',
    'teacher_busy',
    'class_busy',
    'no_teaching_day',
  ];
  return { options, problem: order.find((p) => counts.has(p)) ?? 'no_teaching_day' };
}

/**
 * Check one choice (date, first period, optionally a room). Returns the option with the best
 * free room (or the one asked for), or the first problem found.
 */
export function checkChoice(
  req: MakeUpRequest,
  world: MakeUpWorld,
  date: string,
  startPeriodIndex: number,
  roomId?: string,
): { option: Omit<MakeUpOption, 'week'> } | { problem: MakeUpProblem } {
  const { slot, bell } = req;
  const sectionIds = slot.sectionIds;
  const teacherIds = slot.faculty.map((f) => f.id);
  const periods = block(bell, startPeriodIndex, slot.length);
  if (!periods) return { problem: 'no_teaching_day' };
  const startMinute = periods[0]!.startMinute;
  const endMinute = periods[periods.length - 1]!.endMinute;

  if (date < req.today || (date === req.today && startMinute <= req.nowMinute)) {
    return { problem: 'no_teaching_day' };
  }
  const weekday = timetableWeekday(date, sectionIds, world.cal);
  if (
    !bell.workingDays.includes(weekday) ||
    !isTeachingDay(date, sectionIds, world.cal) ||
    dayOffOn(date, sectionIds, world.cal)
  ) {
    return { problem: 'no_teaching_day' };
  }

  const hours = { startMinute, endMinute };
  const audience = { sectionIds, faculty: slot.faculty };
  for (const d of world.disruptions) {
    if (d.startDate <= date && date <= d.endDate && overlapsHours(d, hours)) {
      if (disruptionCoversSlot(d, audience, world.cal.sections)) {
        return { problem: d.kind === 'faculty_leave' ? 'teacher_unavailable' : 'no_teaching_day' };
      }
    }
  }

  // The cancelled class's own time (checked after holidays and events, so a week-long event
  // reads as "no teaching days", not "busy").
  if (date === req.date && startPeriodIndex === slot.startPeriodIndex) {
    return { problem: 'class_busy' };
  }

  const busy = occupancy(world, date, req.ignoreMakeUpId);
  const overlaps = (o: Occupied) => o.startMinute < endMinute && o.endMinute > startMinute;
  if (busy.some((o) => overlaps(o) && o.sectionIds.some((s) => sectionIds.includes(s)))) {
    return { problem: 'class_busy' };
  }
  if (busy.some((o) => overlaps(o) && o.facultyIds.some((f) => teacherIds.includes(f)))) {
    return { problem: 'teacher_busy' };
  }
  for (const teacher of req.teachers) {
    const off = teacher.unavailable.some(
      (c) => c.weekday === weekday && periods.some((p) => p.index === c.periodIndex),
    );
    if (off) return { problem: 'teacher_unavailable' };
    const taught = busy
      .filter((o) => o.facultyIds.includes(teacher.id))
      .reduce((sum, o) => sum + o.periods, 0);
    if (taught + slot.length > teacher.maxPeriodsPerDay) return { problem: 'teacher_day_full' };
  }

  const taken = new Set(busy.filter(overlaps).flatMap((o) => (o.roomId ? [o.roomId] : [])));
  const room = req.rooms.find((r) => !taken.has(r.id) && (roomId === undefined || r.id === roomId));
  if (!room) return { problem: 'no_room' };

  const first = periods[0]!;
  const last = periods[periods.length - 1]!;
  return {
    option: {
      date,
      startPeriodIndex,
      length: slot.length,
      startMinute,
      endMinute,
      periodLabel: first === last ? first.label : `${first.label}–${last.label}`,
      roomId: room.id,
      roomCode: room.code,
    },
  };
}

/** First periods where a block of `length` fits without crossing a long break. */
export function blockStarts(bell: MakeUpBell, length: number): number[] {
  return bell.periods.map((p) => p.index).filter((i) => block(bell, i, length) !== null);
}

/** The consecutive periods from `start`, or null if they run out or cross a long break. */
function block(bell: MakeUpBell, start: number, length: number): BellPeriod[] | null {
  const out: BellPeriod[] = [];
  for (let i = start; i < start + length; i += 1) {
    const period = bell.periods.find((p) => p.index === i);
    if (!period) return null;
    if (i > start) {
      const longBreak = bell.breaks.some(
        (b) => b.afterPeriodIndex === i - 1 && b.minutes >= LONG_BREAK_MINUTES,
      );
      if (longBreak) return null;
    }
    out.push(period);
  }
  return out;
}

interface Occupied {
  startMinute: number;
  endMinute: number;
  periods: number;
  sectionIds: readonly string[];
  facultyIds: readonly string[];
  roomId: string | null;
}

/** Classes held and make-ups booked on a date. */
function occupancy(world: MakeUpWorld, date: string, ignoreMakeUpId?: string): Occupied[] {
  const out: Occupied[] = [];
  for (const s of world.slots) {
    if (world.cancelled.has(`${s.id} ${date}`)) continue;
    if (!classMeetsOn(s, date, world.version, world.cal)) continue;
    out.push({
      startMinute: s.startMinute,
      endMinute: s.endMinute,
      periods: s.length,
      sectionIds: s.sectionIds,
      facultyIds: s.faculty.map((f) => f.id),
      roomId: s.room?.id ?? null,
    });
  }
  for (const m of world.makeUps) {
    if (m.date !== date || m.id === ignoreMakeUpId) continue;
    out.push({ ...m, periods: m.length });
  }
  return out;
}
