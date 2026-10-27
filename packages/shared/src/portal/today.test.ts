import { describe, expect, it } from 'vitest';
import { demoPublishedTimetable } from '../fixtures';
import type { TimetableSlotV1 } from '../contracts';
import { addDays, isoWeekday, localNow, weekStartOf } from './calendar';
import { classesOn, scopeCovers, type CalendarPlace, type PortalCalendar } from './days';
import { buildToday, buildWeek, type PortalViewer, type TodayInput } from './today';

const fixture = demoPublishedTimetable();
/** The section every fixture slot is for. */
const sectionId = fixture.slots
  .map((s) => s.sectionIds)
  .reduce((acc, ids) => acc.filter((id) => ids.includes(id)))[0]!;
const place: CalendarPlace = {
  sectionId,
  cohortId: 'c0000000-0000-4000-8000-000000000001',
  programmeId: 'b0000000-0000-4000-8000-000000000001',
  departmentId: 'd0000000-0000-4000-8000-000000000001',
};
const otherDept = 'd0000000-0000-4000-8000-000000000002';

/** Monday 10 Aug 2026. */
const MONDAY = '2026-08-10';

function calendar(over: Partial<PortalCalendar> = {}): PortalCalendar {
  return {
    workingDays: [1, 2, 3, 4, 5],
    termStart: '2026-07-20',
    termEnd: '2026-12-15',
    holidays: [],
    extraDays: [],
    places: new Map([[sectionId, place]]),
    ...over,
  };
}

const student: PortalViewer = {
  kind: 'student',
  id: '5e000000-0000-4000-8000-000000000001',
  name: 'Test Student',
  groupLabel: 'CS A',
  place,
  electiveSectionIds: [],
};

function input(over: Partial<TodayInput> = {}): TodayInput {
  return {
    viewer: student,
    timezone: 'Asia/Kolkata',
    date: MONDAY,
    now: { date: MONDAY, minute: 0 },
    slots: fixture.slots,
    calendar: calendar(),
    ...over,
  };
}

const mondaySlots = fixture.slots.filter((s) => s.weekday === 1);

describe('calendar helpers', () => {
  it('knows weekdays, weeks and the local date in a time zone', () => {
    expect(isoWeekday(MONDAY)).toBe(1);
    expect(isoWeekday('2026-08-16')).toBe(7);
    expect(weekStartOf('2026-08-16')).toBe(MONDAY);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    // 20:00 UTC is 01:30 the next day in India.
    expect(localNow('Asia/Kolkata', new Date('2026-08-09T20:00:00Z'))).toEqual({
      date: MONDAY,
      minute: 90,
    });
  });
});

describe('scopeCovers', () => {
  it('matches institute, department and section scopes', () => {
    expect(scopeCovers({ scopeType: 'institute', scopeId: null }, place)).toBe(true);
    expect(scopeCovers({ scopeType: 'department', scopeId: place.departmentId }, place)).toBe(true);
    expect(scopeCovers({ scopeType: 'department', scopeId: otherDept }, place)).toBe(false);
    expect(scopeCovers({ scopeType: 'section', scopeId: sectionId }, place)).toBe(true);
  });
});

describe('buildToday', () => {
  it("lists a student's Monday in time order with teachers' names", () => {
    const today = buildToday(input());
    expect(today.contract).toBe('portal-read.v1');
    expect(mondaySlots.length).toBeGreaterThan(0);
    expect(today.classes.map((c) => c.id).sort()).toEqual(mondaySlots.map((s) => s.id).sort());
    const starts = today.classes.map((c) => c.startMinute);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    const first = mondaySlots.find((s) => s.id === today.classes[0]!.id)!;
    expect(today.classes[0]!.withWhom).toBe(first.faculty.map((f) => f.name).join(', '));
    expect(today.holiday).toBeNull();
    expect(today.nextClassId).toBe(today.classes[0]!.id);
  });

  it('points at the class in progress or the next one, and none once the day is over', () => {
    const classes = buildToday(input()).classes;
    const second = classes.find((c) => c.startMinute > classes[0]!.startMinute)!;
    const midFirst = classes[0]!.endMinute; // the first class just ended
    expect(buildToday(input({ now: { date: MONDAY, minute: midFirst } })).nextClassId).toBe(
      second.id,
    );
    expect(buildToday(input({ now: { date: MONDAY, minute: 1439 } })).nextClassId).toBeNull();
    expect(buildToday(input({ now: { date: addDays(MONDAY, 1), minute: 0 } })).nextClassId).toBe(
      null,
    );
  });

  it('shows a holiday for the student’s department and strikes its classes', () => {
    const holidays = [
      {
        name: 'Department fest',
        startDate: MONDAY,
        endDate: MONDAY,
        scopeType: 'department' as const,
        scopeId: place.departmentId,
        changedAt: new Date('2026-08-01T00:00:00Z'),
      },
    ];
    const today = buildToday(input({ calendar: calendar({ holidays }) }));
    expect(today.holiday).toBe('Department fest');
    expect(today.classes.every((c) => c.cancelled && c.cancelReason === 'Department fest')).toBe(
      true,
    );
    expect(today.nextClassId).toBeNull();
    expect(today.changes[0]).toEqual({
      kind: 'holiday',
      message: 'No classes on Mon, 10 Aug: Department fest',
      classId: null,
    });
  });

  it('ignores another department’s holiday', () => {
    const holidays = [
      {
        name: 'Other fest',
        startDate: MONDAY,
        endDate: MONDAY,
        scopeType: 'department' as const,
        scopeId: otherDept,
        changedAt: new Date(),
      },
    ];
    const today = buildToday(input({ calendar: calendar({ holidays }) }));
    expect(today.holiday).toBeNull();
    expect(today.classes.some((c) => c.cancelled)).toBe(false);
    expect(today.changes).toEqual([]);
  });

  it('runs Monday’s timetable on an extra working Saturday, and nothing outside the term', () => {
    const saturday = addDays(MONDAY, 5);
    const extraDays = [
      { date: saturday, followsWeekday: 1, scopeType: 'institute' as const, scopeId: null },
    ];
    const sat = buildToday(input({ date: saturday, calendar: calendar({ extraDays }) }));
    expect(sat.classes).toHaveLength(mondaySlots.length);
    expect(buildToday(input({ date: saturday })).classes).toEqual([]);
    expect(buildToday(input({ calendar: calendar({ termStart: '2026-09-01' }) })).classes).toEqual(
      [],
    );
  });

  it('shows a teacher the group they teach, and cancels a class only when all its sections are off', () => {
    const slot: TimetableSlotV1 = mondaySlots[0]!;
    const secondSection = 'a0000000-0000-4000-8000-0000000000aa';
    const combined = { ...slot, sectionIds: [sectionId, secondSection] };
    const faculty: PortalViewer = {
      ...student,
      kind: 'faculty',
      groupLabel: 'VT',
      place: { sectionId: null, cohortId: null, programmeId: null, departmentId: otherDept },
    };
    const holidays = [
      {
        name: 'Section trip',
        startDate: MONDAY,
        endDate: MONDAY,
        scopeType: 'section' as const,
        scopeId: sectionId,
        changedAt: new Date(),
      },
    ];
    const cal = calendar({ holidays });
    const options = {
      audience: (s: TimetableSlotV1) => s.sectionIds.map((id) => cal.places.get(id) ?? place),
      withWhom: (s: TimetableSlotV1) => s.target.name,
    };
    // Only this section is off: its own class is cancelled, the combined one still runs.
    expect(classesOn(cal, [slot], MONDAY, options)[0]!.cancelled).toBe(true);
    const today = buildToday(input({ viewer: faculty, slots: [slot], calendar: cal }));
    expect(today.holiday).toBeNull();
    expect(today.classes[0]).toMatchObject({ cancelled: true, withWhom: slot.target.name });
    expect(today.changes[0]?.kind).toBe('cancelled');
    expect(today.changes[0]?.message).toContain('is cancelled: Section trip');

    const both = new Map(cal.places);
    both.set(secondSection, { ...place, sectionId: secondSection });
    const runs = buildToday(
      input({ viewer: faculty, slots: [combined], calendar: { ...cal, places: both } }),
    );
    expect(runs.classes[0]!.cancelled).toBe(false);
  });

  it('keeps only the electives a student chose', () => {
    const elective: TimetableSlotV1 = {
      ...mondaySlots[0]!,
      id: 'e0000000-0000-4000-8000-000000000001',
      target: {
        kind: 'elective_section',
        id: 'e1000000-0000-4000-8000-000000000001',
        name: 'ML-1',
      },
    };
    const other = {
      ...elective,
      id: 'e0000000-0000-4000-8000-000000000002',
      target: { ...elective.target, id: 'e1000000-0000-4000-8000-000000000002', name: 'IoT-1' },
    };
    const chose = { ...student, electiveSectionIds: [elective.target.id] };
    const ids = buildToday(input({ viewer: chose, slots: [elective, other] })).classes.map(
      (c) => c.id,
    );
    expect(ids).toEqual([elective.id]);
  });
});

describe('buildWeek', () => {
  it('lists the working days of the week with their classes and a holiday', () => {
    const holidays = [
      {
        name: 'Independence Day',
        startDate: '2026-08-15',
        endDate: '2026-08-15',
        scopeType: 'institute' as const,
        scopeId: null,
        changedAt: new Date(),
      },
    ];
    const week = buildWeek({
      ...input({ date: '2026-08-13', calendar: calendar({ holidays }) }),
      versionId: fixture.version!.id,
    });
    expect(week.weekStart).toBe(MONDAY);
    expect(week.days.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(week.days.at(-1)).toMatchObject({ teaching: false, holiday: 'Independence Day' });
    const total = week.days.reduce((n, d) => n + d.classes.length, 0);
    expect(total).toBe(fixture.slots.filter((s) => s.weekday <= 5).length);
  });
});
