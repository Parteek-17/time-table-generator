import { describe, expect, it } from 'vitest';
import type { TimetableSlotV1 } from '../contracts';
import { demoPublishedTimetable, demoTermSnapshot } from '../fixtures';
import { calendarFromSnapshot, type RescheduleCalendar } from './calendar';
import type { DisruptionMatch } from './disruption';
import {
  blockStarts,
  checkChoice,
  findMakeUps,
  searchWeeks,
  type MakeUpBell,
  type MakeUpRequest,
  type MakeUpWorld,
} from './makeup';
import { audienceStrength, makeUpRequestFrom } from './makeup-input';

const NONE = { departmentId: null, programmeId: null, cohortId: null, sectionId: null };
const place = {
  departmentId: 'cse',
  programmeId: 'p',
  cohortId: 'c',
  teachingFrom: '2026-07-27',
  teachingTo: '2026-11-30',
};
const cal: RescheduleCalendar = {
  termStart: '2026-07-27',
  termEnd: '2026-12-31',
  timezone: 'Asia/Kolkata',
  sections: new Map([
    ['sec-a', place],
    ['sec-b', place],
  ]),
  daysOff: [],
  extraWorkingDays: [],
};

// P1 9:00 … P3 till 11:30, 40-minute lunch, P4 12:10 … P6 till 14:40.
const bell: MakeUpBell = {
  workingDays: [1, 2, 3, 4, 5],
  periods: [540, 590, 640, 730, 780, 830].map((start, i) => ({
    index: i + 1,
    label: `P${i + 1}`,
    startMinute: start,
    endMinute: start + 50,
  })),
  breaks: [{ afterPeriodIndex: 3, minutes: 40 }],
};

let n = 0;
function slot(
  weekday: number,
  period: number,
  sectionId: string,
  teacher: string,
  room: string,
  length = 1,
): TimetableSlotV1 {
  const p = bell.periods[period - 1]!;
  const last = bell.periods[period + length - 2]!;
  n += 1;
  return {
    id: `slot-${n}`,
    versionId: 'v-1',
    weekday,
    startPeriodIndex: period,
    length,
    startMinute: p.startMinute,
    endMinute: last.endMinute,
    assignmentId: 'as',
    component: 'lecture',
    course: { id: 'course', code: 'CS301', shortName: 'DS', title: 'Data Structures' },
    target: { kind: 'section', id: sectionId, name: sectionId },
    sectionIds: [sectionId],
    faculty: [{ id: teacher, name: teacher, shortCode: teacher }],
    room: { id: room, code: room },
  };
}

// The cancelled class: Wednesday P1, sec-a with f-1 in R1, on 7 Oct 2026.
const cancelledSlot = slot(3, 1, 'sec-a', 'f-1', 'R1');
const mondayFull = [1, 2, 3, 4, 5, 6].map((p) => slot(1, p, 'sec-a', 'f-9', 'R9'));
const tuesdayP1Teacher = slot(2, 1, 'sec-b', 'f-1', 'R2');

function setup(over: Partial<MakeUpWorld> = {}, req: Partial<MakeUpRequest> = {}) {
  const world: MakeUpWorld = {
    cal,
    version: { validFrom: '2026-07-27', validTo: null },
    slots: [cancelledSlot, ...mondayFull, tuesdayP1Teacher],
    cancelled: new Set([`${cancelledSlot.id} 2026-10-07`]),
    makeUps: [],
    disruptions: [],
    ...over,
  };
  const request: MakeUpRequest = {
    slot: cancelledSlot,
    date: '2026-10-07',
    bell,
    teachers: [{ id: 'f-1', name: 'f-1', maxPeriodsPerDay: 6, unavailable: [] }],
    rooms: [
      { id: 'R1', code: 'R1', capacity: 60 },
      { id: 'R2', code: 'R2', capacity: 70 },
    ],
    today: '2026-10-05',
    nowMinute: 0,
    ...req,
  };
  return { world, request };
}

const event = (over: Partial<DisruptionMatch>): DisruptionMatch => ({
  kind: 'event',
  scopeType: 'institute',
  departmentId: null,
  sectionId: null,
  facultyId: null,
  startDate: '2026-10-05',
  endDate: '2026-10-09',
  startMinute: null,
  endMinute: null,
  ...over,
});

const first = (s: { options: { date: string; periodLabel: string; roomId: string }[] }) =>
  s.options[0] && `${s.options[0].date} ${s.options[0].periodLabel} ${s.options[0].roomId}`;

describe('findMakeUps', () => {
  it('takes the earliest period free for class, teacher and room in the same week', () => {
    const { world, request } = setup();
    const found = findMakeUps(request, world);
    // Monday the class is busy all day; Tuesday P1 the teacher is busy.
    expect(first(found)).toBe('2026-10-06 P2 R1');
    expect(found.options[0]!.week).toBe('same');
    expect(found.options).toHaveLength(8);
  });

  it('never offers a period that has started', () => {
    const { world, request } = setup({}, { today: '2026-10-06', nowMinute: 600 });
    expect(first(findMakeUps(request, world))).toBe('2026-10-06 P3 R1');
  });

  it('uses the next suitable room when the first is taken', () => {
    const { world, request } = setup({
      slots: [cancelledSlot, ...mondayFull, tuesdayP1Teacher, slot(2, 2, 'sec-b', 'f-5', 'R1')],
    });
    expect(first(findMakeUps(request, world))).toBe('2026-10-06 P2 R2');
  });

  it('counts make-ups already booked and cancelled classes freeing their time', () => {
    const booked = {
      id: 'mu-1',
      date: '2026-10-06',
      startMinute: 590,
      endMinute: 640,
      length: 1,
      roomId: 'R7',
      sectionIds: ['sec-a'],
      facultyIds: ['f-7'],
    };
    const { world, request } = setup({ makeUps: [booked] });
    expect(first(findMakeUps(request, world))).toBe('2026-10-06 P3 R1');
    // Moving that make-up itself: its own booking is no clash.
    expect(first(findMakeUps({ ...request, ignoreMakeUpId: 'mu-1' }, world))).toBe(
      '2026-10-06 P2 R1',
    );
    // The teacher's Tuesday P1 class is cancelled too: that period is free now.
    const freed = setup({
      makeUps: [booked],
      cancelled: new Set([`${cancelledSlot.id} 2026-10-07`, `${tuesdayP1Teacher.id} 2026-10-06`]),
    });
    expect(first(findMakeUps(freed.request, freed.world))).toBe('2026-10-06 P1 R1');
  });

  it('moves to the next week when an event takes the whole week', () => {
    const { world, request } = setup({ disruptions: [event({})] });
    const found = findMakeUps(request, world);
    // Monday is full every week; Tuesday P1 the teacher is busy.
    expect(first(found)).toBe('2026-10-13 P2 R1');
    expect(found.options.every((o) => o.week === 'next')).toBe(true);

    const twoWeeks = setup({ disruptions: [event({ endDate: '2026-10-16' })] });
    expect(findMakeUps(twoWeeks.request, twoWeeks.world)).toEqual({
      options: [],
      problem: 'no_teaching_day',
    });
  });

  it('respects teacher limits, unavailable periods and leave', () => {
    const limited = setup(
      {},
      {
        teachers: [
          {
            id: 'f-1',
            name: 'f-1',
            maxPeriodsPerDay: 1,
            unavailable: [{ weekday: 3, periodIndex: 2 }],
          },
        ],
      },
    );
    // Tuesday: already one period. Wednesday P1 is the cancelled class itself; P2 is unavailable.
    expect(first(findMakeUps(limited.request, limited.world))).toBe('2026-10-07 P3 R1');

    const onLeave = setup({
      disruptions: [event({ kind: 'faculty_leave', facultyId: 'f-1', endDate: '2026-10-16' })],
    });
    expect(findMakeUps(onLeave.request, onLeave.world)).toEqual({
      options: [],
      problem: 'teacher_unavailable',
    });
  });

  it('says a suitable room is the problem when class and teacher are free', () => {
    const { world, request } = setup({}, { rooms: [] });
    expect(findMakeUps(request, world)).toEqual({ options: [], problem: 'no_room' });
  });

  it('keeps lab blocks away from the lunch break and checks a chosen room', () => {
    expect(blockStarts(bell, 2)).toEqual([1, 2, 4, 5]);
    expect(blockStarts(bell, 3)).toEqual([1, 4]);
    const { world, request } = setup();
    expect(checkChoice(request, world, '2026-10-06', 2, 'R2')).toMatchObject({
      option: { roomId: 'R2', startMinute: 590 },
    });
    expect(checkChoice(request, world, '2026-10-05', 2, 'R2')).toEqual({ problem: 'class_busy' });
    expect(checkChoice(request, world, '2026-10-10', 2)).toEqual({ problem: 'no_teaching_day' });
  });

  it('searches from this week when the cancelled class’s week is over', () => {
    expect(searchWeeks('2026-09-30', '2026-10-07')).toEqual({
      same: '2026-10-05',
      next: '2026-10-12',
    });
    expect(searchWeeks('2026-10-21', '2026-10-07')).toEqual({
      same: '2026-10-19',
      next: '2026-10-26',
    });
  });
});

describe('makeUpRequestFrom', () => {
  it('finds a make-up for a real demo class, original room first', () => {
    const snapshot = demoTermSnapshot();
    const { version, slots } = demoPublishedTimetable();
    const lecture = slots.find((s) => s.component === 'lecture' && s.room)!;
    const request = makeUpRequestFrom(snapshot, lecture, '2026-10-07', {
      today: '2026-10-05',
      nowMinute: 0,
    });
    if ('problem' in request) throw new Error(request.problem);
    expect(request.rooms[0]!.id).toBe(lecture.room!.id);
    expect(request.rooms.every((r) => r.capacity >= audienceStrength(snapshot, lecture))).toBe(
      true,
    );
    expect(request.teachers.map((t) => t.id)).toEqual(lecture.faculty.map((f) => f.id));

    const found = findMakeUps(request, {
      cal: calendarFromSnapshot(snapshot),
      version: version!,
      slots,
      cancelled: new Set(),
      makeUps: [],
      disruptions: [],
    });
    expect(found.options.length).toBeGreaterThan(0);
    // Never on top of another CS B class.
    for (const o of found.options) {
      const weekday = new Date(`${o.date}T00:00:00Z`).getUTCDay() || 7;
      const clash = slots.some(
        (s) => s.weekday === weekday && s.startMinute < o.endMinute && s.endMinute > o.startMinute,
      );
      expect(clash).toBe(false);
    }
  });
});
