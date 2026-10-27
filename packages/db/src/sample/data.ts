/**
 * "Demo Institute of Engineering": a fictional college used by `pnpm db:seed` and by
 * "Try with sample data". No real people, no real institute (CLAUDE.md "Things to avoid").
 *
 * Odd term July–Dec 2026 of session 2026-27. Everything a timetable needs is present and
 * consistent, except the gaps listed in PLANNED_GAPS, which the readiness check must find.
 */

export const SAMPLE_INSTITUTE = {
  name: 'Demo Institute of Engineering',
  affiliatingUniversityName: 'Demo Technical University',
  timezone: 'Asia/Kolkata',
};

export const SESSION = { name: '2026-27', startYear: 2026 };

export const TERM = {
  kind: 'odd' as const,
  label: 'July–Dec 2026',
  startDate: '2026-07-27',
  endDate: '2026-12-31',
  minTeachingDays: 90,
};

/**
 * The gaps the sample deliberately leaves, so the readiness page has something to show.
 * packages/db/test/sample.test.ts asserts readiness reports exactly these.
 */
export const PLANNED_GAPS = {
  /** MBA 2026 batch: cohort exists, no sections entered yet. */
  cohortWithoutSections: 'MBA S1',
  /** ME 2025 batch: section of 40 split into sub-groups of 20 and 18. */
  subGroupsDontAddUp: { cohort: 'ME S3', section: 'ME A', subGroups: [20, 18] },
  /** ECE 2025 batch: nobody teaches the tutorial of Network Analysis yet. */
  missingAssignment: { cohort: 'ECE S3', courseCode: 'EC201', component: 'tutorial' as const },
  /** An Applied Sciences teacher takes Maths-III lectures for five CSE sections (15 > 14). */
  overloadedFaculty: { shortCode: 'MI', courseCode: 'AS201', sections: ['A', 'B', 'C', 'D', 'E'] },
  /** Engineering Graphics needs a drawing hall; the institute has none yet. */
  missingRoomType: 'drawing_hall' as const,
  /**
   * First year (from 10 Aug) and LEET (from 3 Aug) fall short of 90 teaching days; 2nd year
   * onwards (from 27 Jul) reach exactly 90 thanks to seven working Saturdays. Warning only.
   */
  shortTeachingDays: ['first year', 'LEET'],
};

export type DeptCode = 'CSE' | 'ECE' | 'ME' | 'AS' | 'MGT';

export const DEPARTMENTS: readonly {
  code: DeptCode;
  name: string;
  kind: 'teaching' | 'service';
}[] = [
  { code: 'CSE', name: 'Computer Science and Engineering', kind: 'teaching' },
  { code: 'ECE', name: 'Electronics and Communication Engineering', kind: 'teaching' },
  { code: 'ME', name: 'Mechanical Engineering', kind: 'teaching' },
  { code: 'AS', name: 'Applied Sciences', kind: 'service' },
  { code: 'MGT', name: 'Management', kind: 'teaching' },
];

export interface ProgrammeDef {
  code: string;
  name: string;
  level: 'ug' | 'pg';
  totalSemesters: number;
  lateralEntrySemester: number | null;
  department: DeptCode | null;
  /** Branch code → department, plus the prefix used in section names (CS A). */
  branches: readonly {
    code: string;
    name: string;
    department: DeptCode;
    sectionPrefix: string;
    isDefault?: boolean;
  }[];
  schemes: readonly string[];
}

export const PROGRAMMES: readonly ProgrammeDef[] = [
  {
    code: 'BTECH',
    name: 'B.Tech',
    level: 'ug',
    totalSemesters: 8,
    lateralEntrySemester: 3,
    department: null,
    branches: [
      {
        code: 'CSE',
        name: 'Computer Science and Engineering',
        department: 'CSE',
        sectionPrefix: 'CS',
      },
      {
        code: 'ECE',
        name: 'Electronics and Communication Engineering',
        department: 'ECE',
        sectionPrefix: 'EC',
      },
      { code: 'ME', name: 'Mechanical Engineering', department: 'ME', sectionPrefix: 'ME' },
    ],
    schemes: ['Scheme 2022', 'Scheme 2024'],
  },
  {
    code: 'MTECH',
    name: 'M.Tech',
    level: 'pg',
    totalSemesters: 4,
    lateralEntrySemester: null,
    department: 'CSE',
    branches: [
      {
        code: 'CSE',
        name: 'Computer Science and Engineering',
        department: 'CSE',
        sectionPrefix: 'MT',
      },
    ],
    schemes: ['Scheme 2024'],
  },
  {
    code: 'MBA',
    name: 'MBA',
    level: 'pg',
    totalSemesters: 4,
    lateralEntrySemester: null,
    department: 'MGT',
    branches: [
      { code: 'GEN', name: 'MBA', department: 'MGT', sectionPrefix: 'MBA', isDefault: true },
    ],
    schemes: ['Scheme 2024'],
  },
  {
    code: 'BCA',
    name: 'BCA',
    level: 'ug',
    totalSemesters: 6,
    lateralEntrySemester: null,
    department: 'CSE',
    branches: [
      { code: 'GEN', name: 'BCA', department: 'CSE', sectionPrefix: 'BCA', isDefault: true },
    ],
    schemes: ['Scheme 2024'],
  },
];

type CourseType =
  | 'core'
  | 'programme_elective'
  | 'open_elective'
  | 'mandatory'
  | 'project'
  | 'seminar'
  | 'training'
  | 'mooc';

export interface CourseDef {
  code: string;
  title: string;
  short: string;
  ltp: readonly [number, number, number];
  dept: DeptCode;
  /** Branch codes; empty = common to every branch. */
  branches?: readonly string[];
  type?: CourseType;
  electiveGroup?: string;
  labCategory?: string;
  roomType?: 'drawing_hall' | 'workshop' | 'seminar';
  tutorialBy?: 'section' | 'subgroup';
  practicalBy?: 'section' | 'subgroup';
  isScheduled?: boolean;
}

/** Scheme (programme code + scheme name) → semester → courses. Only running semesters. */
export const COURSES: Readonly<Record<string, Readonly<Record<number, readonly CourseDef[]>>>> = {
  'BTECH|Scheme 2024': {
    1: [
      {
        code: 'AS101',
        title: 'Engineering Mathematics-I',
        short: 'Maths-I',
        ltp: [3, 1, 0],
        dept: 'AS',
        tutorialBy: 'section',
      },
      {
        code: 'AS102',
        title: 'Engineering Physics',
        short: 'Physics',
        ltp: [3, 0, 2],
        dept: 'AS',
        labCategory: 'Physics lab',
      },
      {
        code: 'CS101',
        title: 'Programming for Problem Solving',
        short: 'PPS',
        ltp: [3, 0, 2],
        dept: 'CSE',
        labCategory: 'Software lab',
      },
      {
        code: 'EC101',
        title: 'Basic Electrical Engineering',
        short: 'BEE',
        ltp: [3, 1, 2],
        dept: 'ECE',
        labCategory: 'Electrical lab',
        tutorialBy: 'section',
      },
      {
        code: 'ME101',
        title: 'Engineering Graphics',
        short: 'EG',
        ltp: [1, 0, 4],
        dept: 'ME',
        roomType: 'drawing_hall',
      },
    ],
    3: [
      {
        code: 'AS201',
        title: 'Engineering Mathematics-III',
        short: 'Maths-III',
        ltp: [3, 1, 0],
        dept: 'AS',
        tutorialBy: 'section',
      },
      {
        code: 'AS202',
        title: 'Constitution of India',
        short: 'COI',
        ltp: [2, 0, 0],
        dept: 'AS',
        type: 'mandatory',
      },
      {
        code: 'CS201',
        title: 'Data Structures',
        short: 'DS',
        ltp: [3, 0, 2],
        dept: 'CSE',
        branches: ['CSE'],
        labCategory: 'Software lab',
      },
      {
        code: 'CS202',
        title: 'Object Oriented Programming',
        short: 'OOP',
        ltp: [3, 0, 2],
        dept: 'CSE',
        branches: ['CSE'],
        labCategory: 'Software lab',
      },
      {
        code: 'CS203',
        title: 'Discrete Mathematics',
        short: 'DM',
        ltp: [3, 1, 0],
        dept: 'CSE',
        branches: ['CSE'],
        tutorialBy: 'section',
      },
      {
        code: 'EC202',
        title: 'Digital Electronics',
        short: 'DE',
        ltp: [3, 0, 2],
        dept: 'ECE',
        branches: ['CSE', 'ECE'],
        labCategory: 'Hardware lab',
      },
      {
        code: 'EC201',
        title: 'Network Analysis',
        short: 'NA',
        ltp: [3, 1, 0],
        dept: 'ECE',
        branches: ['ECE'],
        tutorialBy: 'section',
      },
      {
        code: 'EC203',
        title: 'Analog Electronics',
        short: 'AE',
        ltp: [3, 0, 2],
        dept: 'ECE',
        branches: ['ECE'],
        labCategory: 'Electronics lab',
      },
      {
        code: 'ME201',
        title: 'Thermodynamics',
        short: 'TD',
        ltp: [3, 1, 0],
        dept: 'ME',
        branches: ['ME'],
        tutorialBy: 'section',
      },
      {
        code: 'ME202',
        title: 'Strength of Materials',
        short: 'SOM',
        ltp: [3, 0, 2],
        dept: 'ME',
        branches: ['ME'],
        labCategory: 'Mechanics lab',
      },
      {
        code: 'ME203',
        title: 'Manufacturing Processes',
        short: 'MP',
        ltp: [2, 0, 2],
        dept: 'ME',
        branches: ['ME'],
        roomType: 'workshop',
      },
    ],
    5: [
      {
        code: 'ME301',
        title: 'Disaster Management',
        short: 'DMG',
        ltp: [2, 0, 0],
        dept: 'ME',
        type: 'mandatory',
      },
      {
        code: 'CS301',
        title: 'Operating Systems',
        short: 'OS',
        ltp: [3, 0, 2],
        dept: 'CSE',
        branches: ['CSE'],
        labCategory: 'Software lab',
      },
      {
        code: 'CS302',
        title: 'Database Management Systems',
        short: 'DBMS',
        ltp: [3, 0, 2],
        dept: 'CSE',
        branches: ['CSE'],
        labCategory: 'Software lab',
      },
      {
        code: 'CS303',
        title: 'Design and Analysis of Algorithms',
        short: 'DAA',
        ltp: [3, 1, 0],
        dept: 'CSE',
        branches: ['CSE'],
        tutorialBy: 'section',
      },
      {
        code: 'CS351',
        title: 'Machine Learning',
        short: 'ML',
        ltp: [3, 0, 0],
        dept: 'CSE',
        branches: ['CSE'],
        type: 'programme_elective',
        electiveGroup: 'Elective-I',
      },
      {
        code: 'CS352',
        title: 'Cloud Computing',
        short: 'CC',
        ltp: [3, 0, 0],
        dept: 'CSE',
        branches: ['CSE'],
        type: 'programme_elective',
        electiveGroup: 'Elective-I',
      },
      {
        code: 'CS353',
        title: 'Web Technologies',
        short: 'WT',
        ltp: [3, 0, 0],
        dept: 'CSE',
        branches: ['CSE'],
        type: 'programme_elective',
        electiveGroup: 'Elective-I',
      },
      {
        code: 'EC301',
        title: 'Microprocessors',
        short: 'MPR',
        ltp: [3, 0, 2],
        dept: 'ECE',
        branches: ['ECE'],
        labCategory: 'Hardware lab',
      },
      {
        code: 'EC302',
        title: 'Communication Systems',
        short: 'CS',
        ltp: [3, 1, 0],
        dept: 'ECE',
        branches: ['ECE'],
        tutorialBy: 'section',
      },
      {
        code: 'ME302',
        title: 'Machine Design',
        short: 'MD',
        ltp: [3, 1, 0],
        dept: 'ME',
        branches: ['ME'],
        tutorialBy: 'section',
      },
      {
        code: 'ME303',
        title: 'Fluid Mechanics',
        short: 'FM',
        ltp: [3, 0, 2],
        dept: 'ME',
        branches: ['ME'],
        labCategory: 'Mechanics lab',
      },
    ],
  },
  'BTECH|Scheme 2022': {
    7: [
      {
        code: 'CS401',
        title: 'Compiler Design',
        short: 'CD',
        ltp: [3, 0, 2],
        dept: 'CSE',
        branches: ['CSE'],
        labCategory: 'Software lab',
      },
      {
        code: 'CS451',
        title: 'Deep Learning',
        short: 'DL',
        ltp: [3, 0, 0],
        dept: 'CSE',
        branches: ['CSE'],
        type: 'programme_elective',
        electiveGroup: 'Elective-IV',
      },
      {
        code: 'CS452',
        title: 'Blockchain Technologies',
        short: 'BCT',
        ltp: [3, 0, 0],
        dept: 'CSE',
        branches: ['CSE'],
        type: 'programme_elective',
        electiveGroup: 'Elective-IV',
      },
      {
        code: 'EC401',
        title: 'VLSI Design',
        short: 'VLSI',
        ltp: [3, 0, 2],
        dept: 'ECE',
        branches: ['ECE'],
        labCategory: 'Electronics lab',
      },
      {
        code: 'ME401',
        title: 'Refrigeration and Air Conditioning',
        short: 'RAC',
        ltp: [3, 0, 0],
        dept: 'ME',
        branches: ['ME'],
      },
      {
        code: 'MG401',
        title: 'Entrepreneurship Development',
        short: 'ED',
        ltp: [3, 0, 0],
        dept: 'MGT',
        type: 'open_elective',
        electiveGroup: 'Open Elective',
      },
      {
        code: 'OE499',
        title: 'Open Elective (MOOC)',
        short: 'MOOC',
        ltp: [3, 0, 0],
        dept: 'CSE',
        type: 'mooc',
        electiveGroup: 'Open Elective',
        isScheduled: false,
      },
      {
        code: 'PR401',
        title: 'Project-I',
        short: 'PROJ',
        ltp: [0, 0, 4],
        dept: 'CSE',
        type: 'project',
        isScheduled: false,
      },
    ],
  },
  'MTECH|Scheme 2024': {
    1: [
      {
        code: 'MCS101',
        title: 'Advanced Algorithms',
        short: 'AA',
        ltp: [3, 0, 2],
        dept: 'CSE',
        labCategory: 'Software lab',
        practicalBy: 'section',
      },
      {
        code: 'MCS102',
        title: 'Advanced Database Systems',
        short: 'ADS',
        ltp: [3, 0, 2],
        dept: 'CSE',
        labCategory: 'Software lab',
        practicalBy: 'section',
      },
      { code: 'MCS103', title: 'Research Methodology', short: 'RM', ltp: [2, 0, 0], dept: 'CSE' },
    ],
    3: [
      {
        code: 'MCS201',
        title: 'Seminar',
        short: 'SEM',
        ltp: [0, 0, 2],
        dept: 'CSE',
        type: 'seminar',
        roomType: 'seminar',
        practicalBy: 'section',
      },
      {
        code: 'MCS202',
        title: 'Dissertation Part-I',
        short: 'DISS',
        ltp: [0, 0, 8],
        dept: 'CSE',
        type: 'project',
        isScheduled: false,
      },
    ],
  },
  'MBA|Scheme 2024': {
    1: [
      {
        code: 'MB101',
        title: 'Principles of Management',
        short: 'POM',
        ltp: [3, 0, 0],
        dept: 'MGT',
      },
      { code: 'MB102', title: 'Managerial Economics', short: 'ME', ltp: [3, 0, 0], dept: 'MGT' },
      {
        code: 'MB103',
        title: 'Accounting for Managers',
        short: 'AFM',
        ltp: [3, 1, 0],
        dept: 'MGT',
        tutorialBy: 'section',
      },
    ],
    3: [
      { code: 'MB201', title: 'Strategic Management', short: 'SM', ltp: [3, 0, 0], dept: 'MGT' },
      {
        code: 'MB202',
        title: 'Business Analytics',
        short: 'BA',
        ltp: [3, 0, 2],
        dept: 'MGT',
        labCategory: 'Software lab',
      },
      {
        code: 'MB203',
        title: 'Summer Training Report',
        short: 'STR',
        ltp: [0, 0, 2],
        dept: 'MGT',
        type: 'training',
        isScheduled: false,
      },
    ],
  },
  'BCA|Scheme 2024': {
    1: [
      {
        code: 'BCA101',
        title: 'Programming in C',
        short: 'C',
        ltp: [3, 0, 2],
        dept: 'CSE',
        labCategory: 'Software lab',
      },
      {
        code: 'BCA102',
        title: 'Mathematics for Computing',
        short: 'MFC',
        ltp: [3, 1, 0],
        dept: 'AS',
        tutorialBy: 'section',
      },
    ],
    3: [
      {
        code: 'BCA201',
        title: 'Java Programming',
        short: 'JAVA',
        ltp: [3, 0, 2],
        dept: 'CSE',
        labCategory: 'Software lab',
      },
      { code: 'BCA202', title: 'Software Engineering', short: 'SE', ltp: [3, 0, 0], dept: 'CSE' },
    ],
    5: [
      {
        code: 'BCA301',
        title: 'Python Programming',
        short: 'PY',
        ltp: [3, 0, 2],
        dept: 'CSE',
        labCategory: 'Software lab',
      },
      { code: 'BCA302', title: 'Computer Networks', short: 'CN', ltp: [3, 0, 0], dept: 'CSE' },
    ],
  },
};

export interface BatchDef {
  programme: string;
  branch: string;
  admissionYear: number;
  entryType?: 'regular' | 'lateral';
  scheme: string;
  /** Section strengths (sections are named A, B, C …). Empty = no sections yet. */
  sections: readonly number[];
  /** Sub-groups per section (0 = none, e.g. small M.Tech classes). Default 2. */
  subGroups?: number;
  /** Lateral entry: sits in the sections of this regular batch's cohort. */
  joins?: { admissionYear: number };
}

/** Section strengths include any lateral-entry students sitting in them. */
export const BATCHES: readonly BatchDef[] = [
  {
    programme: 'BTECH',
    branch: 'CSE',
    admissionYear: 2026,
    scheme: 'Scheme 2024',
    sections: [60, 60],
  },
  {
    programme: 'BTECH',
    branch: 'CSE',
    admissionYear: 2025,
    scheme: 'Scheme 2024',
    sections: [64, 64, 62, 62, 60, 60],
  },
  {
    programme: 'BTECH',
    branch: 'CSE',
    admissionYear: 2026,
    entryType: 'lateral',
    scheme: 'Scheme 2024',
    sections: [],
    joins: { admissionYear: 2025 },
  },
  {
    programme: 'BTECH',
    branch: 'CSE',
    admissionYear: 2024,
    scheme: 'Scheme 2024',
    sections: [62, 60],
  },
  { programme: 'BTECH', branch: 'CSE', admissionYear: 2023, scheme: 'Scheme 2022', sections: [60] },
  { programme: 'BTECH', branch: 'ECE', admissionYear: 2026, scheme: 'Scheme 2024', sections: [60] },
  { programme: 'BTECH', branch: 'ECE', admissionYear: 2025, scheme: 'Scheme 2024', sections: [58] },
  { programme: 'BTECH', branch: 'ECE', admissionYear: 2024, scheme: 'Scheme 2024', sections: [56] },
  { programme: 'BTECH', branch: 'ECE', admissionYear: 2023, scheme: 'Scheme 2022', sections: [54] },
  { programme: 'BTECH', branch: 'ME', admissionYear: 2026, scheme: 'Scheme 2024', sections: [48] },
  { programme: 'BTECH', branch: 'ME', admissionYear: 2025, scheme: 'Scheme 2024', sections: [40] },
  { programme: 'BTECH', branch: 'ME', admissionYear: 2024, scheme: 'Scheme 2024', sections: [45] },
  { programme: 'BTECH', branch: 'ME', admissionYear: 2023, scheme: 'Scheme 2022', sections: [42] },
  {
    programme: 'MTECH',
    branch: 'CSE',
    admissionYear: 2026,
    scheme: 'Scheme 2024',
    sections: [18],
    subGroups: 0,
  },
  {
    programme: 'MTECH',
    branch: 'CSE',
    admissionYear: 2025,
    scheme: 'Scheme 2024',
    sections: [15],
    subGroups: 0,
  },
  { programme: 'MBA', branch: 'GEN', admissionYear: 2026, scheme: 'Scheme 2024', sections: [] },
  { programme: 'MBA', branch: 'GEN', admissionYear: 2025, scheme: 'Scheme 2024', sections: [60] },
  { programme: 'BCA', branch: 'GEN', admissionYear: 2026, scheme: 'Scheme 2024', sections: [60] },
  { programme: 'BCA', branch: 'GEN', admissionYear: 2025, scheme: 'Scheme 2024', sections: [55] },
  { programme: 'BCA', branch: 'GEN', admissionYear: 2024, scheme: 'Scheme 2024', sections: [50] },
];

/**
 * Elective sections: course code → [name, strength, source sections as "<cohort code>/<section>"].
 * Students of the source sections split across the offered electives of a group.
 */
export const ELECTIVE_SECTIONS: readonly {
  course: string;
  name: string;
  strength: number;
  from: readonly string[];
}[] = [
  { course: 'CS351', name: 'ML-1', strength: 66, from: ['CSE S5/A', 'CSE S5/B'] },
  { course: 'CS352', name: 'CC-1', strength: 56, from: ['CSE S5/A', 'CSE S5/B'] },
  { course: 'CS451', name: 'DL-1', strength: 34, from: ['CSE S7/A'] },
  { course: 'CS452', name: 'BCT-1', strength: 26, from: ['CSE S7/A'] },
  // Open elective drawing students from three branches; the rest take the MOOC.
  { course: 'MG401', name: 'ED-1', strength: 60, from: ['CSE S7/A', 'ECE S7/A', 'ME S7/A'] },
];

/** Teaching days: 2nd year onwards from 27 Jul; LEET from 3 Aug; first year from 10 Aug. */
export const COHORT_WINDOWS = {
  seniors: {
    teachingStart: '2026-07-27',
    prepHolidaysStart: '2026-12-07',
    prepHolidaysEnd: '2026-12-11',
    endSemExamStart: '2026-12-14',
  },
  leet: {
    teachingStart: '2026-08-03',
    prepHolidaysStart: '2026-12-07',
    prepHolidaysEnd: '2026-12-11',
    endSemExamStart: '2026-12-14',
  },
  firstYear: {
    teachingStart: '2026-08-10',
    prepHolidaysStart: '2026-12-07',
    prepHolidaysEnd: '2026-12-11',
    endSemExamStart: '2026-12-14',
  },
};

export const MID_SEM_WINDOWS = [
  { label: 'Mid-semester test 1', startDate: '2026-09-16', endDate: '2026-09-18' },
  { label: 'Mid-semester test 2', startDate: '2026-11-02', endDate: '2026-11-04' },
];

export const HOLIDAYS = [
  { name: 'Independence Day', startDate: '2026-08-15', endDate: '2026-08-15' },
  { name: 'Gandhi Jayanti', startDate: '2026-10-02', endDate: '2026-10-02' },
  { name: 'Dussehra', startDate: '2026-10-20', endDate: '2026-10-20' },
  { name: 'Diwali break', startDate: '2026-11-09', endDate: '2026-11-10' },
  { name: 'Annual sports meet', startDate: '2026-11-19', endDate: '2026-11-20' },
];

/** Working Saturdays already in the calendar (institute-wide). */
export const EXTRA_WORKING_DAYS = [
  { date: '2026-08-22', followsWeekday: 1 },
  { date: '2026-09-05', followsWeekday: 2 },
  { date: '2026-09-26', followsWeekday: 3 },
  { date: '2026-10-10', followsWeekday: 4 },
  { date: '2026-10-31', followsWeekday: 5 },
  { date: '2026-11-14', followsWeekday: 1 },
  { date: '2026-11-28', followsWeekday: 2 },
];

/** Mon–Fri 08:30–17:30, 60-minute periods, lunch 11:30–12:30. */
export const BELL = {
  name: 'Main bell schedule',
  workingDays: [1, 2, 3, 4, 5],
  startMinute: 8 * 60 + 30,
  periodMinutes: 60,
  periodCount: 8,
  breaks: [{ label: 'Lunch', afterPeriodIndex: 3, minutes: 60 }],
};

/** Mentoring (MC), Friday 15:30–16:30 (P7), for every B.Tech cohort. */
export const FIXED_SLOTS = [
  {
    kind: 'mentoring' as const,
    label: 'Mentoring (MC)',
    weekday: 5,
    startPeriodIndex: 7,
    endPeriodIndex: 7,
    programme: 'BTECH',
  },
];

export const BUILDINGS = [
  { name: 'Main Block', code: 'MB', floors: 3 },
  { name: 'Lab Block', code: 'LB', floors: 2 },
];

export interface RoomDef {
  code: string;
  building: string;
  floor: number;
  type: 'lecture' | 'lab' | 'seminar' | 'workshop';
  rows: number;
  seatsPerRow: number;
  labCategories?: readonly string[];
  owner?: DeptCode;
  examSeatsPerBench?: number;
}

export const ROOMS: readonly RoomDef[] = [
  ...['G11', 'G12', 'G13', 'G14', 'G15', 'G16', 'G17', 'G18'].map((code): RoomDef => ({
    code,
    building: 'Main Block',
    floor: 0,
    type: 'lecture',
    rows: 12,
    seatsPerRow: 6,
    examSeatsPerBench: 1,
  })),
  ...['S211', 'S212', 'S213', 'S214'].map((code): RoomDef => ({
    code,
    building: 'Main Block',
    floor: 1,
    type: 'lecture',
    rows: 11,
    seatsPerRow: 6,
    examSeatsPerBench: 1,
  })),
  ...['SL-I LAB', 'SL-II LAB', 'SL-III LAB', 'SL-IV LAB'].map((code): RoomDef => ({
    code,
    building: 'Lab Block',
    floor: 1,
    type: 'lab',
    rows: 6,
    seatsPerRow: 6,
    labCategories: ['Software lab'],
    owner: 'CSE',
  })),
  {
    code: 'HL-I LAB',
    building: 'Lab Block',
    floor: 0,
    type: 'lab',
    rows: 6,
    seatsPerRow: 6,
    labCategories: ['Hardware lab'],
    owner: 'ECE',
  },
  {
    code: 'HL-II LAB',
    building: 'Lab Block',
    floor: 0,
    type: 'lab',
    rows: 6,
    seatsPerRow: 6,
    labCategories: ['Hardware lab', 'Electronics lab'],
    owner: 'ECE',
  },
  {
    code: 'EL LAB',
    building: 'Lab Block',
    floor: 0,
    type: 'lab',
    rows: 6,
    seatsPerRow: 6,
    labCategories: ['Electrical lab'],
    owner: 'ECE',
  },
  {
    code: 'PHY LAB',
    building: 'Lab Block',
    floor: 0,
    type: 'lab',
    rows: 6,
    seatsPerRow: 6,
    labCategories: ['Physics lab'],
    owner: 'AS',
  },
  {
    code: 'MECH LAB',
    building: 'Lab Block',
    floor: 0,
    type: 'lab',
    rows: 6,
    seatsPerRow: 6,
    labCategories: ['Mechanics lab'],
    owner: 'ME',
  },
  {
    code: 'WORKSHOP',
    building: 'Lab Block',
    floor: 0,
    type: 'workshop',
    rows: 6,
    seatsPerRow: 6,
    owner: 'ME',
  },
  {
    code: 'SEMINAR HALL',
    building: 'Main Block',
    floor: 0,
    type: 'seminar',
    rows: 12,
    seatsPerRow: 10,
  },
];

export type Designation =
  | 'professor'
  | 'associate_professor'
  | 'assistant_professor'
  | 'lecturer'
  | 'teaching_assistant'
  | 'visiting';

export interface FacultyDef {
  code: string;
  name: string;
  short: string;
  dept: DeptCode;
  designation: Designation;
  experience: 'experienced' | 'fresher';
  /** Other departments they also teach in. */
  alsoTeaches?: readonly DeptCode[];
  /** Unavailable (weekday, period) cells. */
  unavailable?: readonly [number, number][];
}

const P: Designation = 'professor';
const ASP: Designation = 'associate_professor';
const AP: Designation = 'assistant_professor';
const TA: Designation = 'teaching_assistant';
const X = 'experienced' as const;
const F = 'fresher' as const;

/** Fictional names. 44 faculty: about what the sample's weekly load (~550 periods) needs. */
export const FACULTY: readonly FacultyDef[] = [
  // Computer Science and Engineering
  {
    code: 'E1001',
    name: 'Dr. Asha Verma',
    short: 'AV',
    dept: 'CSE',
    designation: P,
    experience: X,
    unavailable: [
      [3, 6],
      [3, 7],
      [3, 8],
    ],
  },
  {
    code: 'E1002',
    name: 'Dr. Rohan Mehta',
    short: 'RM',
    dept: 'CSE',
    designation: ASP,
    experience: X,
  },
  {
    code: 'E1003',
    name: 'Ms. Kavya Nair',
    short: 'KN',
    dept: 'CSE',
    designation: AP,
    experience: X,
  },
  {
    code: 'E1004',
    name: 'Mr. Arjun Sethi',
    short: 'AS',
    dept: 'CSE',
    designation: AP,
    experience: X,
  },
  {
    code: 'E1005',
    name: 'Ms. Pooja Rana',
    short: 'PR',
    dept: 'CSE',
    designation: AP,
    experience: F,
  },
  {
    code: 'E1006',
    name: 'Mr. Vikram Toor',
    short: 'VT',
    dept: 'CSE',
    designation: AP,
    experience: F,
  },
  {
    code: 'E1007',
    name: 'Ms. Nidhi Kapoor',
    short: 'NK',
    dept: 'CSE',
    designation: AP,
    experience: F,
  },
  {
    code: 'E1008',
    name: 'Mr. Sahil Arora',
    short: 'SA',
    dept: 'CSE',
    designation: AP,
    experience: F,
  },
  {
    code: 'E1009',
    name: 'Ms. Tanvi Bhatia',
    short: 'TB',
    dept: 'CSE',
    designation: AP,
    experience: F,
  },
  {
    code: 'E1010',
    name: 'Mr. Karan Malhotra',
    short: 'KM',
    dept: 'CSE',
    designation: AP,
    experience: F,
  },
  {
    code: 'E1011',
    name: 'Ms. Ritu Saini',
    short: 'RS',
    dept: 'CSE',
    designation: AP,
    experience: F,
  },
  {
    code: 'E1012',
    name: 'Mr. Dev Chawla',
    short: 'DC',
    dept: 'CSE',
    designation: AP,
    experience: F,
  },
  {
    code: 'E1013',
    name: 'Ms. Ishita Grover',
    short: 'IG',
    dept: 'CSE',
    designation: AP,
    experience: F,
    unavailable: [
      [1, 1],
      [2, 1],
    ],
  },
  {
    code: 'E1014',
    name: 'Mr. Manav Khurana',
    short: 'MK',
    dept: 'CSE',
    designation: AP,
    experience: F,
  },
  {
    code: 'E1015',
    name: 'Ms. Sneha Dhillon',
    short: 'SD',
    dept: 'CSE',
    designation: AP,
    experience: F,
  },
  {
    code: 'E1016',
    name: 'Mr. Yash Bajaj',
    short: 'YB',
    dept: 'CSE',
    designation: AP,
    experience: F,
  },
  {
    code: 'E1017',
    name: 'Ms. Ananya Joshi',
    short: 'AJ',
    dept: 'CSE',
    designation: AP,
    experience: F,
  },
  {
    code: 'E1051',
    name: 'Ms. Ria Thakur',
    short: 'RT',
    dept: 'CSE',
    designation: TA,
    experience: F,
  },
  {
    code: 'E1052',
    name: 'Mr. Om Pathak',
    short: 'OP',
    dept: 'CSE',
    designation: TA,
    experience: F,
  },
  // Electronics and Communication Engineering
  {
    code: 'E2001',
    name: 'Dr. Suresh Kohli',
    short: 'SK',
    dept: 'ECE',
    designation: P,
    experience: X,
  },
  {
    code: 'E2002',
    name: 'Dr. Lata Menon',
    short: 'LM',
    dept: 'ECE',
    designation: ASP,
    experience: X,
  },
  {
    code: 'E2003',
    name: 'Mr. Gaurav Dutta',
    short: 'GD',
    dept: 'ECE',
    designation: AP,
    experience: F,
  },
  {
    code: 'E2004',
    name: 'Ms. Payal Suri',
    short: 'PS',
    dept: 'ECE',
    designation: AP,
    experience: F,
  },
  {
    code: 'E2005',
    name: 'Mr. Rahul Bhalla',
    short: 'RB',
    dept: 'ECE',
    designation: AP,
    experience: F,
  },
  {
    code: 'E2006',
    name: 'Ms. Jyoti Kalra',
    short: 'JK',
    dept: 'ECE',
    designation: AP,
    experience: F,
  },
  {
    code: 'E2007',
    name: 'Mr. Abhay Tandon',
    short: 'AT',
    dept: 'ECE',
    designation: AP,
    experience: F,
  },
  {
    code: 'E2008',
    name: 'Ms. Neha Batra',
    short: 'NBA',
    dept: 'ECE',
    designation: AP,
    experience: F,
  },
  {
    code: 'E2009',
    name: 'Mr. Pranav Rao',
    short: 'PRA',
    dept: 'ECE',
    designation: AP,
    experience: F,
  },
  // Mechanical Engineering (also teaches Disaster Management to every branch)
  {
    code: 'E3001',
    name: 'Dr. Ajay Rathore',
    short: 'AR',
    dept: 'ME',
    designation: P,
    experience: X,
  },
  {
    code: 'E3002',
    name: 'Mr. Deepak Negi',
    short: 'DN',
    dept: 'ME',
    designation: AP,
    experience: X,
  },
  {
    code: 'E3003',
    name: 'Ms. Shalini Vohra',
    short: 'SV',
    dept: 'ME',
    designation: AP,
    experience: F,
  },
  {
    code: 'E3004',
    name: 'Mr. Mohit Rawat',
    short: 'MR',
    dept: 'ME',
    designation: AP,
    experience: F,
  },
  {
    code: 'E3005',
    name: 'Ms. Preeti Lamba',
    short: 'PL',
    dept: 'ME',
    designation: AP,
    experience: F,
  },
  {
    code: 'E3006',
    name: 'Mr. Sunil Bhatt',
    short: 'SB',
    dept: 'ME',
    designation: AP,
    experience: F,
  },
  // Applied Sciences (service department: Maths, Physics, Constitution for every branch)
  {
    code: 'E4001',
    name: 'Dr. Meera Iyer',
    short: 'MI',
    dept: 'AS',
    designation: P,
    experience: X,
    alsoTeaches: ['CSE'],
  },
  {
    code: 'E4002',
    name: 'Dr. Naveen Ghosh',
    short: 'NG',
    dept: 'AS',
    designation: ASP,
    experience: X,
  },
  {
    code: 'E4003',
    name: 'Ms. Parul Taneja',
    short: 'PT',
    dept: 'AS',
    designation: AP,
    experience: F,
  },
  {
    code: 'E4004',
    name: 'Mr. Imran Qureshi',
    short: 'IQ',
    dept: 'AS',
    designation: AP,
    experience: F,
  },
  {
    code: 'E4005',
    name: 'Ms. Bhavna Arya',
    short: 'BA',
    dept: 'AS',
    designation: AP,
    experience: F,
  },
  {
    code: 'E4006',
    name: 'Mr. Chetan Walia',
    short: 'CW',
    dept: 'AS',
    designation: AP,
    experience: F,
    unavailable: [
      [5, 7],
      [5, 8],
    ],
  },
  {
    code: 'E4007',
    name: 'Ms. Esha Rawal',
    short: 'ER',
    dept: 'AS',
    designation: AP,
    experience: F,
  },
  // Management
  {
    code: 'E5001',
    name: 'Dr. Sunita Rao',
    short: 'SR',
    dept: 'MGT',
    designation: P,
    experience: X,
  },
  {
    code: 'E5002',
    name: 'Mr. Alok Mathur',
    short: 'AM',
    dept: 'MGT',
    designation: AP,
    experience: X,
  },
  {
    code: 'E5003',
    name: 'Ms. Nisha Kaul',
    short: 'NKA',
    dept: 'MGT',
    designation: AP,
    experience: F,
  },
];

/** Lab co-teachers (TAs) for 2nd-year CSE Data Structures labs. */
export const LAB_TAS = { courseCode: 'CS201', cohort: 'CSE S3', tas: ['RT', 'OP'] };

/** Sample logins. Passwordless: magic link through Mailpit in development. */
export const SAMPLE_USERS = [
  {
    email: 'hod.cse@demo.slotwise.test',
    name: 'Demo HOD (CSE)',
    role: 'hod' as const,
    department: 'CSE' as DeptCode,
  },
  {
    email: 'hod.as@demo.slotwise.test',
    name: 'Demo HOD (Applied Sciences)',
    role: 'hod' as const,
    department: 'AS' as DeptCode,
  },
  {
    email: 'coordinator@demo.slotwise.test',
    name: 'Demo Timetable Coordinator',
    role: 'timetable_coordinator' as const,
    department: null,
  },
  {
    email: 'exams@demo.slotwise.test',
    name: 'Demo Exam Coordinator',
    role: 'exam_coordinator' as const,
    department: null,
  },
  {
    email: 'faculty@demo.slotwise.test',
    name: 'Demo Faculty',
    role: 'faculty' as const,
    department: 'CSE' as DeptCode,
    facultyShort: 'KN',
  },
];
