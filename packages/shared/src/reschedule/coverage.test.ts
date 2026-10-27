import { describe, expect, it } from 'vitest';
import type { TimetableSlotV1 } from '../contracts';
import type { RescheduleCalendar } from './calendar';
import { coverageStatus, syllabusCoverage } from './coverage';

// Four teaching weeks: Mon 5 Oct – Fri 30 Oct 2026, one holiday on Fri 9 Oct.
const cal: RescheduleCalendar = {
  termStart: '2026-10-05',
  termEnd: '2026-10-30',
  timezone: 'Asia/Kolkata',
  sections: new Map([
    [
      'sec-a',
      {
        departmentId: 'd',
        programmeId: 'p',
        cohortId: 'c',
        teachingFrom: '2026-10-05',
        teachingTo: '2026-10-30',
      },
    ],
  ]),
  daysOff: [
    {
      scopeType: 'institute',
      departmentId: null,
      programmeId: null,
      cohortId: null,
      sectionId: null,
      name: 'Holiday',
      startDate: '2026-10-09',
      endDate: '2026-10-09',
    },
  ],
  extraWorkingDays: [],
};
const version = { validFrom: '2026-10-05', validTo: null };
const course = { id: 'ds', code: 'CS301', shortName: 'DS', title: 'Data Structures' };

function slot(
  id: string,
  weekday: number,
  target: TimetableSlotV1['target'],
  length = 1,
): TimetableSlotV1 {
  return {
    id,
    versionId: 'v',
    weekday,
    startPeriodIndex: 1,
    length,
    startMinute: 540,
    endMinute: 540 + 50 * length,
    assignmentId: 'as',
    component: length > 1 ? 'practical' : 'lecture',
    course,
    target,
    sectionIds: ['sec-a'],
    faculty: [{ id: 'f', name: 'F', shortCode: 'F' }],
    room: null,
  };
}

const section = { kind: 'section' as const, id: 'sec-a', name: 'CS A' };
const g1 = { kind: 'subgroup' as const, id: 'g1', name: 'CS A-G1' };
const g2 = { kind: 'subgroup' as const, id: 'g2', name: 'CS A-G2' };
const mon = slot('mon', 1, section);
const fri = slot('fri', 5, section);
const labG1 = slot('lab-g1', 2, g1, 2);
const labG2 = slot('lab-g2', 3, g2, 2);

const run = (over: Partial<Parameters<typeof syllabusCoverage>[0]> = {}) =>
  syllabusCoverage({
    slots: [mon, fri, labG1, labG2],
    version,
    cal,
    cancellations: [],
    syllabusHours: new Map([['ds', 15]]),
    sectionNames: new Map([['sec-a', 'CS A']]),
    today: '2026-10-14',
    ...over,
  });

describe('syllabusCoverage', () => {
  it('counts the term’s periods per section, with one lab group’s labs', () => {
    const [row] = run();
    // Lectures: 4 Mondays + 3 Fridays (9 Oct is a holiday). Labs: 4 × 2 for one group.
    expect(row).toMatchObject({
      audience: { kind: 'section', id: 'sec-a', name: 'CS A' },
      scheduled: 15,
      lost: 0,
      delivered: 15,
      percent: 100,
      status: 'ok',
    });
    // Up to Wed 14 Oct: Mondays 5, 12; Friday 9 is off; labs on 6 and 13 (or 7 and 14).
    expect(row!.heldSoFar).toBe(2 + 4);
  });

  it('subtracts cancelled periods and adds make-ups back', () => {
    const lostLab = { slot: labG1, date: '2026-10-20', periods: 2, makeUp: null };
    const lostMon = {
      slot: mon,
      date: '2026-10-12',
      periods: 1,
      makeUp: { date: '2026-10-13', length: 1 },
    };
    const [row] = run({ cancellations: [lostLab, lostMon] });
    // G1 lost a lab, so it now speaks for the section: 7 lectures + 6 lab periods.
    expect(row).toMatchObject({
      scheduled: 15,
      lost: 3,
      madeUp: 1,
      delivered: 13,
      percent: 87,
      status: 'flag',
    });
    expect(row!.heldSoFar).toBe(6);
  });

  it('warns below 100 %, flags below 90 %, and says when the scheme has no hours', () => {
    expect(coverageStatus(15, 15)).toBe('ok');
    expect(coverageStatus(14, 15)).toBe('warn');
    expect(coverageStatus(13, 15)).toBe('flag');
    expect(coverageStatus(13, null)).toBe('unknown');
    const [row] = run({ syllabusHours: new Map() });
    expect(row).toMatchObject({ syllabusHours: null, percent: null, status: 'unknown' });
  });

  it('names a section that only has lab-group classes, and keeps electives apart', () => {
    const elective = slot('el', 4, { kind: 'elective_section', id: 'ml-1', name: 'ML-1' });
    const rows = run({
      slots: [labG1, { ...elective, course: { ...course, id: 'ml', code: 'CS450' } }],
    });
    expect(rows.map((r) => [r.course.code, r.audience.name])).toEqual([
      ['CS301', 'CS A'],
      ['CS450', 'ML-1'],
    ]);
  });
});
