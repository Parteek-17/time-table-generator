/**
 * Domain constants and sensible defaults (CLAUDE.md "Ease of use": users change only what
 * differs). Nothing here is a hard limit; every value is editable per institute.
 */

/** ISO weekday numbers: 1 = Monday … 7 = Sunday. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_NAMES: Readonly<Record<Weekday, string>> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

export const SATURDAY: Weekday = 6;

export const PROGRAMME_LEVELS = ['ug', 'pg', 'diploma', 'doctoral'] as const;
export type ProgrammeLevel = (typeof PROGRAMME_LEVELS)[number];

export const COURSE_TYPES = [
  'core',
  'programme_elective',
  'open_elective',
  'mandatory',
  'audit',
  'lab',
  'project',
  'seminar',
  'training',
  'mooc',
] as const;
export type CourseType = (typeof COURSE_TYPES)[number];

/** Course types whose students are regrouped into elective sections. */
export const ELECTIVE_COURSE_TYPES: readonly CourseType[] = ['programme_elective', 'open_elective'];

export const COMPONENTS = ['lecture', 'tutorial', 'practical'] as const;
export type Component = (typeof COMPONENTS)[number];
export const COMPONENT_LETTER: Readonly<Record<Component, 'L' | 'T' | 'P'>> = {
  lecture: 'L',
  tutorial: 'T',
  practical: 'P',
};

export const ROOM_TYPES = [
  'lecture',
  'tutorial',
  'lab',
  'seminar',
  'drawing_hall',
  'workshop',
] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export const EXPERIENCE_LEVELS = ['experienced', 'fresher'] as const;
export type Experience = (typeof EXPERIENCE_LEVELS)[number];

export interface LoadLimits {
  maxPeriodsPerDay: number;
  maxPeriodsPerWeek: number;
}

/** Teaching load defaults by experience (ADR 0007). Freshers usually teach more periods. */
export const DEFAULT_LOAD: Readonly<Record<Experience, LoadLimits>> = {
  experienced: { maxPeriodsPerDay: 4, maxPeriodsPerWeek: 14 },
  fresher: { maxPeriodsPerDay: 5, maxPeriodsPerWeek: 18 },
};

export function defaultLoad(experience: Experience): LoadLimits {
  return { ...DEFAULT_LOAD[experience] };
}

export interface ProgrammePreset {
  code: string;
  name: string;
  level: ProgrammeLevel;
  totalSemesters: number;
  lateralEntrySemester: number | null;
  /** True when the programme normally has branches (B.Tech CSE, ECE …). */
  hasBranches: boolean;
}

/** Presets offered in setup wizard step 3. */
export const PROGRAMME_PRESETS: readonly ProgrammePreset[] = [
  {
    code: 'BTECH',
    name: 'B.Tech',
    level: 'ug',
    totalSemesters: 8,
    lateralEntrySemester: 3,
    hasBranches: true,
  },
  {
    code: 'MTECH',
    name: 'M.Tech',
    level: 'pg',
    totalSemesters: 4,
    lateralEntrySemester: null,
    hasBranches: true,
  },
  {
    code: 'MBA',
    name: 'MBA',
    level: 'pg',
    totalSemesters: 4,
    lateralEntrySemester: null,
    hasBranches: false,
  },
  {
    code: 'MCA',
    name: 'MCA',
    level: 'pg',
    totalSemesters: 4,
    lateralEntrySemester: null,
    hasBranches: false,
  },
  {
    code: 'BCA',
    name: 'BCA',
    level: 'ug',
    totalSemesters: 6,
    lateralEntrySemester: null,
    hasBranches: false,
  },
  {
    code: 'BBA',
    name: 'BBA',
    level: 'ug',
    totalSemesters: 6,
    lateralEntrySemester: null,
    hasBranches: false,
  },
  {
    code: 'BARCH',
    name: 'B.Arch',
    level: 'ug',
    totalSemesters: 10,
    lateralEntrySemester: null,
    hasBranches: false,
  },
  {
    code: 'PHD',
    name: 'Ph.D. coursework',
    level: 'doctoral',
    totalSemesters: 2,
    lateralEntrySemester: null,
    hasBranches: true,
  },
];

/** Branch code used for programmes without branches. */
export const DEFAULT_BRANCH_CODE = 'GEN';

/** Bell schedule pre-filled for a new institute: 09:00, 50-minute periods, lunch after P4. */
export const DEFAULT_BELL = {
  startMinute: 9 * 60,
  periodMinutes: 50,
  periodCount: 8,
  breaks: [{ label: 'Lunch', afterPeriodIndex: 4, minutes: 40 }],
  workingDays: [1, 2, 3, 4, 5] as Weekday[],
} as const;

/** Breaks at least this long split a lab block (CLAUDE.md scheduling rules). */
export const LONG_BREAK_MINUTES = 30;

export const DEFAULT_MIN_TEACHING_DAYS = 90;
export const DEFAULT_SUBGROUPS_PER_SECTION = 2;
export const DEFAULT_LAB_BLOCK_LENGTH = 2;
