import { describe, expect, it } from 'vitest';
import { buildBellSchedule } from './bell';
import type { PlanAssignment, PlanCohort, PlanCourse } from './planning';
import { readiness, type ReadinessSnapshot, type SnapshotBellSchedule } from './readiness';

/**
 * A tiny fictional term: one cohort (CSE S3, two sections of 60 with two sub-groups each),
 * three courses (Data Structures 3-1-2, Maths 3-1-0, one offered elective, one MOOC) and
 * every assignment in place. It starts "Ready"; each test breaks one thing.
 */
function bell(over: Partial<SnapshotBellSchedule> = {}): SnapshotBellSchedule {
  const breaks = [{ label: 'Lunch', afterPeriodIndex: 3, minutes: 60 }];
  return {
    id: 'bell',
    name: 'Main bell schedule',
    isDefault: true,
    overrides: [],
    workingDays: [1, 2, 3, 4, 5],
    periods: buildBellSchedule({ startMinute: 510, periodMinutes: 60, periodCount: 8, breaks }),
    breaks,
    ...over,
  };
}

const course = (over: Partial<PlanCourse> & Pick<PlanCourse, 'id' | 'code'>): PlanCourse => ({
  title: over.code,
  shortName: over.code,
  schemeVersionId: 'scheme24',
  semester: 3,
  branchIds: [],
  type: 'core',
  electiveGroup: null,
  roomType: null,
  labCategory: null,
  labBlockLength: 2,
  isScheduled: true,
  tutorialBy: 'subgroup',
  practicalBy: 'subgroup',
  lectures: 3,
  tutorials: 0,
  practicals: 0,
  ...over,
});

const cohort: PlanCohort = {
  id: 'cse3',
  displayCode: 'CSE S3',
  semester: 3,
  isRunning: true,
  entryType: 'regular',
  schemeVersionId: 'scheme24',
  programmeId: 'btech',
  branchId: 'cse',
  departmentId: 'dept-cse',
  joinsCohortId: null,
};

let seq = 0;
const assign = (
  courseId: string,
  component: PlanAssignment['component'],
  target: PlanAssignment['target'],
  targetId: string,
  facultyId: string,
): PlanAssignment => ({
  id: `a${++seq}`,
  courseId,
  component,
  target,
  sectionId: target === 'section' ? targetId : null,
  subGroupId: target === 'subgroup' ? targetId : null,
  electiveSectionId: target === 'elective_section' ? targetId : null,
  faculty: [{ facultyId, role: 'main' }],
});

function snapshot(): ReadinessSnapshot {
  return {
    term: {
      id: 'odd26',
      label: 'July–Dec 2026',
      status: 'active',
      startDate: '2026-07-27',
      endDate: '2026-12-31',
      minTeachingDays: 90,
    },
    hasActiveTerm: true,
    bellSchedules: [bell()],
    cohorts: [cohort],
    sections: [
      { id: 'A', cohortId: 'cse3', name: 'A', displayName: 'CSE A', strength: 60 },
      { id: 'B', cohortId: 'cse3', name: 'B', displayName: 'CSE B', strength: 60 },
    ],
    subGroups: [
      { id: 'A1', sectionId: 'A', name: 'A1', strength: 30 },
      { id: 'A2', sectionId: 'A', name: 'A2', strength: 30 },
      { id: 'B1', sectionId: 'B', name: 'B1', strength: 30 },
      { id: 'B2', sectionId: 'B', name: 'B2', strength: 30 },
    ],
    electiveSections: [
      { id: 'PE1-1', courseId: 'pe1', name: 'PE1-1', strength: 70, sourceSectionIds: ['A', 'B'] },
    ],
    courses: [
      course({ id: 'ds', code: 'CS301', tutorials: 1, practicals: 2, labCategory: 'Software lab' }),
      course({ id: 'maths', code: 'MA301', tutorials: 1, tutorialBy: 'section' }),
      course({ id: 'pe1', code: 'CS351', type: 'programme_elective', electiveGroup: 'Elective-I' }),
      course({ id: 'pe2', code: 'CS352', type: 'programme_elective', electiveGroup: 'Elective-I' }),
      course({ id: 'mooc', code: 'MOOC1', type: 'mooc', isScheduled: false }),
      // Another semester and another scheme: not this cohort's.
      course({ id: 'other', code: 'CS501', semester: 5 }),
      course({ id: 'old', code: 'CS301-OLD', schemeVersionId: 'scheme22' }),
    ],
    assignments: [
      assign('ds', 'lecture', 'section', 'A', 'f1'),
      assign('ds', 'lecture', 'section', 'B', 'f1'),
      assign('ds', 'tutorial', 'subgroup', 'A1', 'f1'),
      assign('ds', 'tutorial', 'subgroup', 'A2', 'f1'),
      assign('ds', 'tutorial', 'subgroup', 'B1', 'f2'),
      assign('ds', 'tutorial', 'subgroup', 'B2', 'f2'),
      ...['A1', 'A2', 'B1', 'B2'].map((g) => assign('ds', 'practical', 'subgroup', g, 'f2')),
      assign('maths', 'lecture', 'section', 'A', 'f3'),
      assign('maths', 'lecture', 'section', 'B', 'f3'),
      assign('maths', 'tutorial', 'section', 'A', 'f3'),
      assign('maths', 'tutorial', 'section', 'B', 'f3'),
      assign('pe1', 'lecture', 'elective_section', 'PE1-1', 'f4'),
    ],
    faculty: [
      {
        id: 'f1',
        name: 'Dr. Asha Verma',
        shortCode: 'AV',
        maxPeriodsPerWeek: 14,
        unavailableCells: 0,
      },
      {
        id: 'f2',
        name: 'Mr. Kiran Bedi',
        shortCode: 'KB',
        maxPeriodsPerWeek: 18,
        unavailableCells: 0,
      },
      {
        id: 'f3',
        name: 'Dr. Neel Sood',
        shortCode: 'NS',
        maxPeriodsPerWeek: 14,
        unavailableCells: 0,
      },
      {
        id: 'f4',
        name: 'Ms. Rhea Gill',
        shortCode: 'RG',
        maxPeriodsPerWeek: 14,
        unavailableCells: 0,
      },
    ],
    rooms: [
      {
        id: 'g11',
        code: 'G11',
        type: 'lecture',
        labCategories: [],
        rows: 12,
        seatsPerRow: 6,
        capacityOverride: null,
      },
      {
        id: 'sl1',
        code: 'SL-I',
        type: 'lab',
        labCategories: ['Software lab'],
        rows: 6,
        seatsPerRow: 6,
        capacityOverride: null,
      },
    ],
    fixedSlots: [
      {
        scopeType: 'programme',
        programmeId: 'btech',
        weekday: 5,
        startPeriodIndex: 7,
        endPeriodIndex: 7,
      },
    ],
    cohortWindows: [
      {
        id: 'w2',
        programmeId: 'btech',
        semesters: [3, 5, 7],
        entryType: null,
        teachingStart: '2026-07-27',
        prepHolidaysStart: null,
        endSemExamStart: '2026-12-01',
      },
    ],
    holidays: [],
    calendarWindows: [],
    extraWorkingDays: [],
  };
}

const codes = (s: ReadinessSnapshot) => readiness(s).issues.map((i) => i.code);

describe('readiness: the complete fixture', () => {
  it('is ready with no issues', () => {
    const result = readiness(snapshot());
    expect(result.issues).toEqual([]);
    expect(result).toMatchObject({ ready: true, errorCount: 0, warningCount: 0 });
  });

  it('reports load per faculty member across assignments', () => {
    const rows = readiness(snapshot()).facultyLoad;
    expect(rows.map((r) => [r.shortCode, r.assigned, r.status])).toEqual([
      ['AV', 8, 'ok'],
      ['KB', 10, 'ok'],
      ['NS', 8, 'ok'],
      ['RG', 3, 'under'],
    ]);
  });

  it('counts teaching days per cohort', () => {
    expect(readiness(snapshot()).teachingDays).toMatchObject([
      { displayCode: 'CSE S3', teachingDays: 91, minimum: 90 },
    ]);
  });
});

describe('readiness: 1. term and bell schedule', () => {
  it('needs an active term and a bell schedule', () => {
    const s = { ...snapshot(), hasActiveTerm: false, bellSchedules: [] };
    expect(codes(s)).toEqual(expect.arrayContaining(['no_active_term', 'no_bell_schedule']));
  });

  it('warns when checking a term that is still being planned', () => {
    const s = snapshot();
    const result = readiness({ ...s, term: { ...s.term!, status: 'planning' } });
    expect(result.issues.map((i) => [i.code, i.severity])).toEqual([
      ['term_not_active', 'warning'],
    ]);
    expect(result.ready).toBe(true);
  });

  it('needs at least one working day', () => {
    expect(codes({ ...snapshot(), bellSchedules: [bell({ workingDays: [] })] })).toContain(
      'bell_no_working_days',
    );
  });

  it('flags a lab block that cannot fit around lunch', () => {
    const breaks = [{ label: 'Lunch', afterPeriodIndex: 2, minutes: 45 }];
    const short = bell({
      periods: buildBellSchedule({ startMinute: 540, periodMinutes: 50, periodCount: 4, breaks }),
      breaks,
    });
    const s = snapshot();
    s.bellSchedules = [short];
    s.courses = s.courses.map((c) =>
      c.id === 'ds' ? { ...c, practicals: 3, labBlockLength: 3 } : c,
    );
    expect(codes(s)).toContain('lab_block_does_not_fit');
  });
});

describe('readiness: 2. sections', () => {
  it('every running cohort needs sections', () => {
    const s = snapshot();
    s.sections = [];
    s.subGroups = [];
    expect(codes(s)).toContain('cohort_without_sections');
  });

  it('ignores cohorts that are not running (training semester)', () => {
    const s = snapshot();
    s.cohorts = [
      cohort,
      { ...cohort, id: 'cse7', displayCode: 'CSE S7', semester: 7, isRunning: false },
    ];
    expect(readiness(s).ready).toBe(true);
  });

  it('sub-group strengths must add up to the section', () => {
    const s = snapshot();
    s.subGroups = s.subGroups.map((g) => (g.id === 'B2' ? { ...g, strength: 28 } : g));
    const issue = readiness(s).issues.find((i) => i.code === 'subgroups_dont_add_up');
    expect(issue?.message).toBe('CSE B (CSE S3) has 60 students but its sub-groups add up to 58.');
    expect(issue?.fix).toEqual({ screen: 'cohort', id: 'cse3' });
  });

  it('a lateral-entry cohort may sit in the regular sections', () => {
    const s = snapshot();
    const leet = {
      ...cohort,
      id: 'leet',
      displayCode: 'CSE S3 LEET',
      entryType: 'lateral' as const,
      joinsCohortId: 'cse3',
    };
    s.cohorts = [cohort, leet];
    expect(readiness(s).ready).toBe(true);
    s.cohorts = [{ ...leet, joinsCohortId: 'gone' }];
    expect(codes(s)).toContain('joins_missing_cohort');
  });
});

describe('readiness: 3. teaching assignments', () => {
  it('names the sub-groups without a teacher', () => {
    const s = snapshot();
    s.assignments = s.assignments.filter(
      (a) => !(a.courseId === 'ds' && a.component === 'practical' && a.subGroupId === 'B2'),
    );
    const issue = readiness(s).issues.find((i) => i.code === 'missing_assignment');
    expect(issue?.message).toBe('CSE S3: no teacher for CS301 CS301 (P) in B2.');
    expect(issue?.fix).toEqual({ screen: 'teaching', id: 'cse3' });
  });

  it('an assignment without faculty counts as missing', () => {
    const s = snapshot();
    s.assignments = s.assignments.map((a) => (a.courseId === 'pe1' ? { ...a, faculty: [] } : a));
    expect(codes(s)).toEqual(['missing_assignment']);
  });

  it('electives without elective sections are not offered and need no teacher', () => {
    // pe2 has no elective section in the fixture and the fixture is ready.
    expect(readiness(snapshot()).ready).toBe(true);
  });

  it('sections without sub-groups are taught as a whole', () => {
    const s = snapshot();
    s.subGroups = [];
    s.assignments = s.assignments.filter((a) => a.target !== 'subgroup');
    const issues = readiness(s).issues.filter((i) => i.code === 'missing_assignment');
    expect(issues.map((i) => i.message)).toEqual([
      'CSE S3: no teacher for CS301 CS301 (T) in CSE A, CSE B.',
      'CSE S3: no teacher for CS301 CS301 (P) in CSE A, CSE B.',
    ]);
  });
});

describe('readiness: 4. faculty load', () => {
  it('flags faculty above their weekly limit', () => {
    const s = snapshot();
    s.faculty = s.faculty.map((f) => (f.id === 'f2' ? { ...f, maxPeriodsPerWeek: 8 } : f));
    const result = readiness(s);
    expect(result.issues.map((i) => i.message)).toEqual([
      'Mr. Kiran Bedi (KB) has 10 periods a week; their limit is 8.',
    ]);
    expect(result.facultyLoad.find((r) => r.facultyId === 'f2')?.status).toBe('over');
  });

  it('flags faculty who are not free for enough periods', () => {
    const s = snapshot();
    s.faculty = s.faculty.map((f) => (f.id === 'f2' ? { ...f, unavailableCells: 36 } : f));
    expect(codes(s)).toEqual(['faculty_not_enough_free_periods']);
  });
});

describe('readiness: 5. periods per section', () => {
  it('flags a section with more periods than the week has', () => {
    const s = snapshot();
    s.bellSchedules = [bell({ workingDays: [1, 2] })]; // 16 periods, 1 fixed on Fri does not apply
    s.courses = [
      ...s.courses,
      course({ id: 'big', code: 'CS399', lectures: 6 }),
      course({ id: 'big2', code: 'CS398', lectures: 0, isScheduled: true }),
    ];
    s.assignments = [
      ...s.assignments,
      assign('big', 'lecture', 'section', 'A', 'f4'),
      assign('big', 'lecture', 'section', 'B', 'f4'),
    ];
    const messages = readiness(s)
      .issues.filter((i) => i.code === 'section_over_capacity')
      .map((i) => i.message);
    expect(messages).toEqual([
      'CSE A (CSE S3) needs 19 periods a week but only 16 are free (2 days × 8 periods).',
      'CSE B (CSE S3) needs 19 periods a week but only 16 are free (2 days × 8 periods).',
    ]);
  });

  it('fixed slots reduce the free periods', () => {
    const s = snapshot();
    s.fixedSlots = [{ scopeType: 'institute', weekday: 1, startPeriodIndex: 1, endPeriodIndex: 8 }];
    s.bellSchedules = [bell({ workingDays: [1, 2] })];
    expect(readiness(s).issues.find((i) => i.code === 'section_over_capacity')?.message).toBe(
      'CSE A (CSE S3) needs 13 periods a week but only 8 are free (2 days × 8 periods, minus 8 fixed).',
    );
  });
});

describe('readiness: 6. rooms', () => {
  it('needs a room of every required kind', () => {
    const s = snapshot();
    s.rooms = s.rooms.filter((r) => r.type !== 'lab');
    expect(readiness(s).issues.map((i) => i.message)).toEqual([
      'There is no Software lab. CS301 CS301 for CSE S3 needs one.',
    ]);
  });

  it('needs a room big enough for the largest group', () => {
    const s = snapshot();
    s.rooms = s.rooms.map((r) => (r.id === 'g11' ? { ...r, capacityOverride: 65 } : r));
    expect(readiness(s).issues.map((i) => i.message)).toEqual([
      'The largest lecture room seats 65, but CS351 CS351 for CSE S3 has 70 students.',
    ]);
  });
});

describe('readiness: 7. calendar', () => {
  it('warns when teaching days fall short and suggests Saturdays, without blocking', () => {
    const s = snapshot();
    s.holidays = [
      { scopeType: 'institute', startDate: '2026-10-20', endDate: '2026-10-20' },
      { scopeType: 'institute', startDate: '2026-11-09', endDate: '2026-11-11' },
    ];
    const result = readiness(s);
    expect(result.ready).toBe(true);
    expect(result.issues.map((i) => [i.severity, i.message])).toEqual([
      [
        'warning',
        'CSE S3: 87 teaching days, 3 short of 90. Make 3 Saturdays working days to catch up.',
      ],
    ]);
    expect(result.teachingDays[0]!.suggestedSaturdays).toHaveLength(3);
    expect(result.byCategory.calendar).toEqual({ errors: 0, warnings: 1 });
  });

  it('holidays of another department do not count', () => {
    const s = snapshot();
    s.holidays = [
      {
        scopeType: 'department',
        departmentId: 'dept-ece',
        startDate: '2026-10-20',
        endDate: '2026-10-30',
      },
    ];
    expect(readiness(s).issues).toEqual([]);
  });

  it('mid-sem exam weeks are not teaching days; extra working days are', () => {
    const s = snapshot();
    s.calendarWindows = [
      { scopeType: 'institute', startDate: '2026-09-14', endDate: '2026-09-18' },
    ];
    expect(readiness(s).teachingDays[0]!.teachingDays).toBe(86);
    s.extraWorkingDays = [{ scopeType: 'programme', programmeId: 'btech', date: '2026-09-19' }];
    expect(readiness(s).teachingDays[0]!.teachingDays).toBe(87);
  });

  it('later cohort windows (first year) give fewer days', () => {
    const s = snapshot();
    const first = {
      ...cohort,
      id: 'cse1',
      displayCode: 'CSE S1',
      semester: 1,
      schemeVersionId: 'none',
    };
    s.cohorts = [cohort, first];
    s.sections = [
      ...s.sections,
      { id: 'F', cohortId: 'cse1', name: 'A', displayName: 'CSE1 A', strength: 60 },
    ];
    s.cohortWindows = [
      ...s.cohortWindows,
      {
        id: 'w1',
        programmeId: 'btech',
        semesters: [1],
        entryType: null,
        teachingStart: '2026-08-10',
        prepHolidaysStart: null,
        endSemExamStart: '2026-12-01',
      },
    ];
    const result = readiness(s);
    expect(result.teachingDays.map((d) => [d.displayCode, d.teachingDays])).toEqual([
      ['CSE S3', 91],
      ['CSE S1', 81],
    ]);
    expect(result.issues.map((i) => i.message)).toEqual([
      'CSE S1: 81 teaching days, 9 short of 90. Make 9 Saturdays working days to catch up.',
    ]);
  });
});
