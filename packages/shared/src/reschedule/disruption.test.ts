import { describe, expect, it } from 'vitest';
import type { TimetableSlotV1 } from '../contracts';
import { demoPublishedTimetable, demoTermSnapshot } from '../fixtures';
import { calendarFromSnapshot, classDates, type RescheduleCalendar } from './calendar';
import { addDays, eachDate, isoWeekday, minuteIn, todayIn, weekStart } from './dates';
import {
  classesHit,
  CreateDisruptionInput,
  disruptionSections,
  type DisruptionMatch,
} from './disruption';

const NONE = { departmentId: null, programmeId: null, cohortId: null, sectionId: null };

const cal: RescheduleCalendar = {
  termStart: '2026-07-27',
  termEnd: '2026-12-31',
  timezone: 'Asia/Kolkata',
  sections: new Map([
    ['sec-a', place('dept-cse', '2026-07-27', '2026-11-20')],
    ['sec-b', place('dept-cse', '2026-07-27', '2026-11-20')],
    ['sec-e', place('dept-ece', '2026-08-03', '2026-11-20')],
  ]),
  daysOff: [
    {
      ...NONE,
      scopeType: 'institute',
      name: 'Gandhi Jayanti',
      startDate: '2026-10-02',
      endDate: '2026-10-02',
    },
    {
      ...NONE,
      scopeType: 'department',
      departmentId: 'dept-ece',
      name: 'ECE exams',
      startDate: '2026-10-05',
      endDate: '2026-10-06',
    },
  ],
  extraWorkingDays: [{ ...NONE, scopeType: 'institute', date: '2026-10-10', followsWeekday: 5 }],
};

function place(departmentId: string, teachingFrom: string, teachingTo: string) {
  return {
    departmentId,
    programmeId: 'prog',
    cohortId: `c-${departmentId}`,
    teachingFrom,
    teachingTo,
  };
}

function slot(
  id: string,
  weekday: number,
  startMinute: number,
  sectionIds: string[],
  facultyId = 'f-1',
): TimetableSlotV1 {
  return {
    id,
    versionId: 'v-1',
    weekday,
    startPeriodIndex: 1,
    length: 1,
    startMinute,
    endMinute: startMinute + 50,
    assignmentId: 'as-1',
    component: 'lecture',
    course: { id: 'course-1', code: 'CS301', shortName: 'DS', title: 'Data Structures' },
    target: { kind: 'section', id: sectionIds[0]!, name: 'CS A' },
    sectionIds,
    faculty: [{ id: facultyId, name: 'Test Teacher', shortCode: 'TT' }],
    room: { id: 'room-1', code: 'G12' },
  };
}

const version = { validFrom: '2026-07-27', validTo: null };

const fest = (over: Partial<DisruptionMatch> = {}): DisruptionMatch => ({
  kind: 'event',
  scopeType: 'institute',
  departmentId: null,
  sectionId: null,
  facultyId: null,
  startDate: '2026-10-07',
  endDate: '2026-10-09',
  startMinute: null,
  endMinute: null,
  ...over,
});

describe('dates', () => {
  it('walks dates and weekdays', () => {
    expect(eachDate('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(isoWeekday('2026-10-25')).toBe(7);
    expect(isoWeekday('2026-10-26')).toBe(1);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(weekStart('2026-10-29')).toBe('2026-10-26');
  });

  it('reads today and the minute in the institute time zone', () => {
    const now = new Date('2026-10-27T20:00:00Z');
    expect(todayIn(now, 'Asia/Kolkata')).toBe('2026-10-28');
    expect(minuteIn(now, 'Asia/Kolkata')).toBe(1 * 60 + 30);
  });
});

describe('classDates', () => {
  it('skips setup holidays and follows extra working days', () => {
    const fri = slot('s-fri', 5, 540, ['sec-a']);
    expect(classDates(fri, '2026-09-28', '2026-10-11', version, cal)).toEqual([
      // 2 Oct is Gandhi Jayanti; Saturday 10 Oct runs Friday's timetable.
      '2026-10-09',
      '2026-10-10',
    ]);
  });

  it('respects the cohort teaching window, scoped days off and the version', () => {
    const mon = slot('s-mon', 1, 540, ['sec-e']);
    expect(classDates(mon, '2026-07-27', '2026-08-10', version, cal)).toEqual([
      '2026-08-03',
      '2026-08-10',
    ]);
    expect(classDates(mon, '2026-10-05', '2026-10-05', version, cal)).toEqual([]);
    expect(
      classDates(mon, '2026-07-27', '2026-08-10', { validFrom: '2026-08-04', validTo: null }, cal),
    ).toEqual(['2026-08-10']);
    expect(classDates(mon, '2026-11-16', '2026-11-30', version, cal)).toEqual(['2026-11-16']);
  });
});

describe('classesHit', () => {
  const slots = [
    slot('a-wed-9', 3, 540, ['sec-a']),
    slot('a-thu-14', 4, 840, ['sec-a']),
    slot('e-thu-9', 4, 540, ['sec-e'], 'f-2'),
    slot('ab-fri-10', 5, 600, ['sec-a', 'sec-b'], 'f-2'),
  ];

  it('cancels every class of the scope in the dates, sorted', () => {
    const hits = classesHit(fest(), slots, version, cal);
    expect(hits.map((h) => `${h.date} ${h.slot.id}`)).toEqual([
      '2026-10-07 a-wed-9',
      '2026-10-08 e-thu-9',
      '2026-10-08 a-thu-14',
      '2026-10-09 ab-fri-10',
    ]);
  });

  it('limits a department or section event to its classes', () => {
    const ece = classesHit(
      fest({ scopeType: 'department', departmentId: 'dept-ece' }),
      slots,
      version,
      cal,
    );
    expect(ece.map((h) => h.slot.id)).toEqual(['e-thu-9']);
    const secB = classesHit(
      fest({ scopeType: 'section', sectionId: 'sec-b' }),
      slots,
      version,
      cal,
    );
    expect(secB.map((h) => h.slot.id)).toEqual(['ab-fri-10']);
  });

  it('only cancels classes that overlap the hours', () => {
    const afternoon = classesHit(fest({ startMinute: 780, endMinute: 1020 }), slots, version, cal);
    expect(afternoon.map((h) => h.slot.id)).toEqual(['a-thu-14']);
    // A class ending exactly when the event starts is not touched.
    const fromTen = classesHit(fest({ startMinute: 590, endMinute: 600 }), slots, version, cal);
    expect(fromTen).toEqual([]);
  });

  it('cancels a teacher’s classes for faculty leave, whatever the section', () => {
    const leave = classesHit(
      fest({ kind: 'faculty_leave', facultyId: 'f-2' }),
      slots,
      version,
      cal,
    );
    expect(leave.map((h) => h.slot.id)).toEqual(['e-thu-9', 'ab-fri-10']);
  });

  it('finds real classes in the demo term and skips Gandhi Jayanti', () => {
    const snapshot = demoTermSnapshot();
    const published = demoPublishedTimetable();
    const demoCal = calendarFromSnapshot(snapshot);
    const week = classesHit(
      fest({ startDate: '2026-09-28', endDate: '2026-10-04' }),
      published.slots,
      published.version!,
      demoCal,
    );
    expect(week.length).toBeGreaterThan(0);
    expect(week.some((h) => h.date === '2026-10-02')).toBe(false);
    expect(new Set(week.map((h) => h.slot.id)).size).toBe(
      published.slots.filter((s) => s.weekday <= 4).length,
    );
  });
});

describe('disruptionSections', () => {
  it('lists the sections a disruption reaches', () => {
    expect(disruptionSections(fest(), cal.sections)).toBeNull();
    expect(
      disruptionSections(fest({ scopeType: 'department', departmentId: 'dept-cse' }), cal.sections),
    ).toEqual(['sec-a', 'sec-b']);
  });
});

describe('CreateDisruptionInput', () => {
  const base = {
    kind: 'event',
    title: 'Annual fest',
    startDate: '2026-10-07',
    endDate: '2026-10-09',
  };

  it('fills defaults and drops ids the scope does not need', () => {
    const parsed = CreateDisruptionInput.parse({
      ...base,
      departmentId: '00000000-0000-4000-8000-000000000001',
    });
    expect(parsed).toMatchObject({ scopeType: 'institute', departmentId: null, startMinute: null });
  });

  it('explains bad input in plain words', () => {
    const result = CreateDisruptionInput.safeParse({
      ...base,
      scopeType: 'department',
      endDate: '2026-10-01',
      startMinute: 600,
    });
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((i) => i.message);
    expect(messages).toEqual([
      'The last day is before the first day.',
      'Give both a start and an end time, or neither for the whole day.',
      'Pick a department.',
    ]);
    expect(
      CreateDisruptionInput.safeParse({ ...base, endDate: '2026-12-31' }).error?.issues[0]?.message,
    ).toMatch(/at most 31 days/);
    expect(
      CreateDisruptionInput.safeParse({ ...base, kind: 'faculty_leave' }).error?.issues[0]?.message,
    ).toBe('Pick the teacher on leave.');
  });
});
