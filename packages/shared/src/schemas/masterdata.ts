/**
 * Request bodies for the Phase 1 master-data API. Messages are shown to users next to the
 * field, so they are plain and say what to do.
 *
 * Updates send the whole object (PUT): forms always have every field, and cross-field rules
 * (e.g. lateral entry before the final semester) are checked on the complete value.
 */
import { z } from 'zod';
import { validateBellSchedule } from '../domain/bell';
import { isIsoDate, toDayNumber } from '../domain/calendar';
import { COURSE_TYPES, ROOM_TYPES } from '../domain/constants';

// ---- Building blocks ----------------------------------------------------------------

const text = (max: number, empty: string) =>
  z.string({ error: empty }).trim().min(1, empty).max(max, `Keep it under ${max} characters.`);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters.`)
    .nullish()
    .transform((v) => (v ? v : null));

export const codeSchema = z
  .string({ error: 'Enter a code.' })
  .trim()
  .min(1, 'Enter a code.')
  .max(20, 'Keep the code under 20 characters.')
  .regex(
    // Empty is reported once, by min(1) above.
    /^$|^[A-Za-z0-9][A-Za-z0-9 ._\-/()]*$/,
    'Use letters, numbers, spaces, dots, dashes or slashes.',
  );

const nameSchema = text(120, 'Enter a name.');
const id = z.uuid({ error: 'Choose one from the list.' });
const optionalId = id.nullish().transform((v) => v ?? null);
const ids = z.array(id).default([]);

const int = (min: number, max: number, what: string) =>
  z
    .number({ error: `Enter ${what} as a number.` })
    .int(`Enter ${what} as a whole number.`)
    .min(min, `${capitalise(what)} must be at least ${min}.`)
    .max(max, `${capitalise(what)} can be at most ${max}.`);
const optionalInt = (min: number, max: number, what: string) =>
  int(min, max, what)
    .nullish()
    .transform((v) => v ?? null);

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const isoDateSchema = z
  .string({ error: 'Enter a date.' })
  .refine(isIsoDate, 'Enter a date like 2026-07-27.');
const optionalDate = isoDateSchema.nullish().transform((v) => v ?? null);

const weekday = int(1, 7, 'the day');
const semesterSchema = int(1, 12, 'the semester');

function endNotBeforeStart<T extends { startDate: string; endDate: string }>(
  value: T,
  ctx: z.RefinementCtx,
) {
  if (isIsoDate(value.startDate) && isIsoDate(value.endDate)) {
    if (toDayNumber(value.endDate) < toDayNumber(value.startDate)) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'The end date is before the start date.',
      });
    }
  }
}

export const idParam = z.uuid();

// ---- Enums (mirror the Prisma enums) ---------------------------------------------------

export const DEPARTMENT_KINDS = ['teaching', 'service'] as const;
export const STUDY_MODES = ['full_time', 'part_time'] as const;
export const SCHEME_STATUSES = ['draft', 'active', 'retired'] as const;
export const GROUPED_BY = ['section', 'subgroup'] as const;
export const TERM_KINDS = ['odd', 'even'] as const;
export const TERM_STATUSES = ['planning', 'active', 'closed'] as const;
export const ENTRY_TYPES = ['regular', 'lateral'] as const;
export const BATCH_STATUSES = ['active', 'graduated', 'discontinued'] as const;
export const CALENDAR_WINDOW_TYPES = [
  'mid_sem_exam',
  'orientation',
  'vacation',
  'training',
  'other',
] as const;
export const CALENDAR_SCOPES = [
  'institute',
  'department',
  'programme',
  'cohort',
  'section',
] as const;
export const STUDENT_STATUSES = ['active', 'detained', 'left'] as const;
export const DESIGNATIONS = [
  'professor',
  'associate_professor',
  'assistant_professor',
  'lecturer',
  'teaching_assistant',
  'visiting',
] as const;
export const EXPERIENCES = ['experienced', 'fresher'] as const;
export const INSTITUTE_TYPES = ['college', 'university'] as const;
const PROGRAMME_LEVEL_VALUES = ['ug', 'pg', 'diploma', 'doctoral'] as const;

const choose = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values, { error: 'Choose one from the list.' });

// ---- Organisation ---------------------------------------------------------------------

export const instituteProfileSchema = z.object({
  name: text(160, 'Enter the institute name.'),
  type: choose(INSTITUTE_TYPES),
  affiliatingUniversityName: optionalText(160),
  timezone: text(60, 'Choose a time zone.'),
});
export type InstituteProfileInput = z.infer<typeof instituteProfileSchema>;

export const departmentSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  kind: choose(DEPARTMENT_KINDS),
});
export type DepartmentInput = z.infer<typeof departmentSchema>;

const programmeFields = z.object({
  code: codeSchema,
  name: nameSchema,
  level: choose(PROGRAMME_LEVEL_VALUES),
  mode: choose(STUDY_MODES).default('full_time'),
  totalSemesters: int(1, 12, 'the number of semesters'),
  lateralEntrySemester: optionalInt(2, 12, 'the lateral-entry semester'),
  departmentId: optionalId,
  /** Create only: false makes one default branch (MBA, BCA). */
  hasBranches: z.boolean().default(true),
});
export const programmeSchema = programmeFields.superRefine((v, ctx) => {
  if (v.lateralEntrySemester != null && v.lateralEntrySemester > v.totalSemesters) {
    ctx.addIssue({
      code: 'custom',
      path: ['lateralEntrySemester'],
      message: `Lateral entry must be in semester ${v.totalSemesters} or earlier.`,
    });
  }
  if (!v.hasBranches && !v.departmentId) {
    ctx.addIssue({
      code: 'custom',
      path: ['departmentId'],
      message: 'Choose the department that runs this programme.',
    });
  }
});
export type ProgrammeInput = z.infer<typeof programmeSchema>;

export const branchSchema = z.object({
  programmeId: id,
  code: codeSchema,
  name: nameSchema,
  departmentId: id,
});
export type BranchInput = z.infer<typeof branchSchema>;

// ---- Academic structure ----------------------------------------------------------------

export const schemeVersionSchema = z.object({
  programmeId: id,
  name: text(80, 'Enter a name, e.g. Scheme 2024.'),
  status: choose(SCHEME_STATUSES).default('draft'),
});
export type SchemeVersionInput = z.infer<typeof schemeVersionSchema>;

const periods = (what: string) => int(0, 20, what);

export const courseSchema = z
  .object({
    schemeVersionId: id,
    semester: semesterSchema,
    code: codeSchema,
    title: text(160, 'Enter the course title.'),
    shortName: text(20, 'Enter a short name, e.g. DS.'),
    lectures: periods('lectures (L)'),
    tutorials: periods('tutorials (T)'),
    practicals: periods('practicals (P)'),
    creditsOverride: z
      .number({ error: 'Enter credits as a number.' })
      .min(0, 'Credits cannot be negative.')
      .max(40, 'Credits can be at most 40.')
      .nullish()
      .transform((v) => v ?? null),
    syllabusHours: optionalInt(0, 500, 'syllabus hours'),
    type: choose(COURSE_TYPES).default('core'),
    electiveGroup: optionalText(60),
    offeringDepartmentId: id,
    roomType: choose(ROOM_TYPES)
      .nullish()
      .transform((v) => v ?? null),
    labCategory: optionalText(60),
    labBlockLength: int(1, 4, 'the lab block length').default(2),
    isScheduled: z.boolean().default(true),
    tutorialBy: choose(GROUPED_BY).default('subgroup'),
    practicalBy: choose(GROUPED_BY).default('subgroup'),
    /** Empty = common to every branch. */
    branchIds: ids,
  })
  .superRefine((v, ctx) => {
    if (v.isScheduled && v.lectures + v.tutorials + v.practicals === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['lectures'],
        message: 'Enter at least one L, T or P period, or mark the course as not timetabled.',
      });
    }
  });
export type CourseInput = z.infer<typeof courseSchema>;

// ---- Time --------------------------------------------------------------------------------

export const academicSessionSchema = z.object({
  startYear: int(2000, 2100, 'the starting year'),
  /** Default "2026-27". */
  name: optionalText(20),
});
export type AcademicSessionInput = z.infer<typeof academicSessionSchema>;

export const termSchema = z
  .object({
    sessionId: id,
    kind: choose(TERM_KINDS),
    label: text(60, 'Enter a label, e.g. July–Dec 2026.'),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    minTeachingDays: int(0, 300, 'the minimum teaching days').default(90),
    status: choose(TERM_STATUSES).default('planning'),
  })
  .superRefine(endNotBeforeStart);
export type TermInput = z.infer<typeof termSchema>;

export const termCohortWindowSchema = z
  .object({
    termId: id,
    programmeId: id,
    semesters: z.array(semesterSchema).default([]),
    entryType: choose(ENTRY_TYPES)
      .nullish()
      .transform((v) => v ?? null),
    teachingStart: isoDateSchema,
    prepHolidaysStart: optionalDate,
    prepHolidaysEnd: optionalDate,
    endSemExamStart: optionalDate,
  })
  .superRefine((v, ctx) => {
    const after = (field: 'prepHolidaysStart' | 'endSemExamStart', what: string) => {
      const value = v[field];
      if (
        value &&
        isIsoDate(v.teachingStart) &&
        toDayNumber(value) < toDayNumber(v.teachingStart)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `${what} is before teaching starts.`,
        });
      }
    };
    after('prepHolidaysStart', 'Preparatory holidays start');
    after('endSemExamStart', 'The end-semester exam');
    if (v.prepHolidaysEnd && !v.prepHolidaysStart) {
      ctx.addIssue({
        code: 'custom',
        path: ['prepHolidaysStart'],
        message: 'Enter when preparatory holidays start.',
      });
    }
  });
export type TermCohortWindowInput = z.infer<typeof termCohortWindowSchema>;

/** Where a holiday, calendar window, extra working day or fixed slot applies. */
const scopeFields = {
  scopeType: choose(CALENDAR_SCOPES).default('institute'),
  departmentId: optionalId,
  programmeId: optionalId,
  cohortId: optionalId,
  sectionId: optionalId,
};
type ScopeValue = {
  scopeType: (typeof CALENDAR_SCOPES)[number];
  departmentId: string | null;
  programmeId: string | null;
  cohortId: string | null;
  sectionId: string | null;
};
const SCOPE_FIELD = {
  department: 'departmentId',
  programme: 'programmeId',
  cohort: 'cohortId',
  section: 'sectionId',
} as const;

function checkScope(v: ScopeValue, ctx: z.RefinementCtx) {
  if (v.scopeType === 'institute') return;
  const field = SCOPE_FIELD[v.scopeType];
  if (!v[field]) {
    ctx.addIssue({ code: 'custom', path: [field], message: `Choose the ${v.scopeType}.` });
  }
}

/** Clears the scope columns that do not match scopeType, so the database CHECK holds. */
export function normaliseScope<T extends ScopeValue>(v: T): T {
  const keep = v.scopeType === 'institute' ? null : SCOPE_FIELD[v.scopeType];
  return {
    ...v,
    departmentId: keep === 'departmentId' ? v.departmentId : null,
    programmeId: keep === 'programmeId' ? v.programmeId : null,
    cohortId: keep === 'cohortId' ? v.cohortId : null,
    sectionId: keep === 'sectionId' ? v.sectionId : null,
  };
}

export const calendarWindowSchema = z
  .object({
    termId: id,
    type: choose(CALENDAR_WINDOW_TYPES),
    label: text(80, 'Enter a label, e.g. Mid-semester test 1.'),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    ...scopeFields,
  })
  .superRefine((v, ctx) => {
    endNotBeforeStart(v, ctx);
    checkScope(v, ctx);
  })
  .transform(normaliseScope);
export type CalendarWindowInput = z.infer<typeof calendarWindowSchema>;

export const holidaySchema = z
  .object({
    name: text(80, 'Enter the holiday name.'),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    ...scopeFields,
  })
  .superRefine((v, ctx) => {
    endNotBeforeStart(v, ctx);
    checkScope(v, ctx);
  })
  .transform(normaliseScope);
export type HolidayInput = z.infer<typeof holidaySchema>;

/** Pasted lines like "2026-10-20, Dussehra" (parseHolidayLines), all for one scope. */
export const holidayPasteSchema = z
  .object({ text: z.string().max(20_000), ...scopeFields })
  .superRefine(checkScope)
  .transform(normaliseScope);
export type HolidayPasteInput = z.infer<typeof holidayPasteSchema>;

export const extraWorkingDaySchema = z
  .object({ termId: id, date: isoDateSchema, followsWeekday: weekday, ...scopeFields })
  .superRefine(checkScope)
  .transform(normaliseScope);
export type ExtraWorkingDayInput = z.infer<typeof extraWorkingDaySchema>;

const minuteOfDay = int(0, 1440, 'the time');

export const bellScheduleSchema = z
  .object({
    name: text(60, 'Enter a name, e.g. Main bell schedule.'),
    workingDays: z.array(weekday).min(1, 'Pick at least one working day.'),
    isDefault: z.boolean().default(false),
    periods: z
      .array(
        z.object({
          index: int(1, 16, 'the period number'),
          label: text(10, 'Enter a label, e.g. P1.'),
          startMinute: minuteOfDay,
          endMinute: minuteOfDay,
        }),
      )
      .min(1, 'Add at least one period.')
      .max(16, 'At most 16 periods a day.'),
    breaks: z
      .array(
        z.object({
          label: text(30, 'Enter a label, e.g. Lunch.'),
          afterPeriodIndex: int(1, 16, 'the period'),
          minutes: int(1, 240, 'the break length'),
        }),
      )
      .default([]),
    /** Programmes (optionally only some semesters) that use this schedule. */
    programmes: z
      .array(z.object({ programmeId: id, semesters: z.array(semesterSchema).default([]) }))
      .default([]),
  })
  .superRefine((v, ctx) => {
    for (const problem of validateBellSchedule(v)) {
      ctx.addIssue({ code: 'custom', path: ['periods'], message: problem.message });
    }
  });
export type BellScheduleInput = z.infer<typeof bellScheduleSchema>;

// ---- People and groups ---------------------------------------------------------------------

export const batchSchema = z.object({
  programmeId: id,
  branchId: id,
  admissionYear: int(2000, 2100, 'the admission year'),
  entryType: choose(ENTRY_TYPES).default('regular'),
  schemeVersionId: id,
  status: choose(BATCH_STATUSES).default('active'),
});
export type BatchInput = z.infer<typeof batchSchema>;

export const cohortUpdateSchema = z.object({
  semester: semesterSchema,
  isRunning: z.boolean(),
  displayCode: text(30, 'Enter a short code, e.g. D2 CSE.'),
  joinsCohortId: optionalId,
});
export type CohortUpdateInput = z.infer<typeof cohortUpdateSchema>;

const strength = int(0, 1000, 'the strength');

export const sectionSchema = z
  .object({
    cohortId: id,
    name: text(10, 'Enter a section name, e.g. A.'),
    displayName: text(30, 'Enter the name shown in timetables, e.g. CS A.'),
    strength,
    homeRoomId: optionalId,
    /** Replaces the section's sub-groups (matched by name). */
    subGroups: z
      .array(z.object({ name: text(10, 'Enter a sub-group name, e.g. A1.'), strength }))
      .default([]),
  })
  .superRefine((v, ctx) => {
    if (v.subGroups.length === 0) return;
    const sum = v.subGroups.reduce((a, g) => a + g.strength, 0);
    if (sum !== v.strength) {
      ctx.addIssue({
        code: 'custom',
        path: ['subGroups'],
        message: `Sub-groups add up to ${sum}, but the section has ${v.strength} students.`,
      });
    }
    const names = new Set(v.subGroups.map((g) => g.name.toLowerCase()));
    if (names.size !== v.subGroups.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['subGroups'],
        message: 'Each sub-group needs its own name.',
      });
    }
  });
export type SectionInput = z.infer<typeof sectionSchema>;

/** "Make 6 sections of 60, 2 sub-groups each" for a cohort. */
export const sectionBulkSchema = z.object({
  count: int(1, 26, 'the number of sections'),
  strength,
  subGroupsPerSection: int(0, 6, 'the sub-groups per section').default(2),
  /** Display-name prefix, e.g. "CS" → "CS A". */
  prefix: text(20, 'Enter a prefix, e.g. CS.'),
});
export type SectionBulkInput = z.infer<typeof sectionBulkSchema>;

export const electiveSectionSchema = z.object({
  termId: id,
  courseId: id,
  name: text(30, 'Enter a name, e.g. ML-1.'),
  strength,
  sourceSectionIds: z.array(id).min(1, 'Pick the sections its students come from.'),
});
export type ElectiveSectionInput = z.infer<typeof electiveSectionSchema>;

export const studentSchema = z.object({
  batchId: id,
  classRollNo: text(30, 'Enter the class roll number.'),
  universityRollNo: optionalText(30),
  name: nameSchema,
  email: z
    .email({ error: 'Enter a valid email address.' })
    .trim()
    .toLowerCase()
    .nullish()
    .or(z.literal('').transform(() => null))
    .transform((v) => v ?? null),
  phone: optionalText(20),
  sectionId: optionalId,
  subGroupId: optionalId,
  status: choose(STUDENT_STATUSES).default('active'),
});
export type StudentInput = z.infer<typeof studentSchema>;

export const facultySchema = z.object({
  employeeCode: text(30, 'Enter the employee code.'),
  name: nameSchema,
  shortCode: text(8, 'Enter a short code, e.g. VT.'),
  email: z
    .email({ error: 'Enter a valid email address.' })
    .trim()
    .toLowerCase()
    .nullish()
    .or(z.literal('').transform(() => null))
    .transform((v) => v ?? null),
  designation: choose(DESIGNATIONS),
  experience: choose(EXPERIENCES),
  homeDepartmentId: id,
  /** Other departments they teach in. */
  departmentIds: ids,
  maxPeriodsPerDay: int(0, 16, 'periods per day'),
  maxPeriodsPerWeek: int(0, 80, 'periods per week'),
});
export type FacultyInput = z.infer<typeof facultySchema>;

/** Set the load limits of many faculty at once. */
export const facultyBulkLoadSchema = z
  .object({
    facultyIds: z.array(id).min(1, 'Pick at least one person.'),
    maxPeriodsPerDay: optionalInt(0, 16, 'periods per day'),
    maxPeriodsPerWeek: optionalInt(0, 80, 'periods per week'),
  })
  .refine((v) => v.maxPeriodsPerDay != null || v.maxPeriodsPerWeek != null, {
    message: 'Enter periods per day, per week, or both.',
    path: ['maxPeriodsPerWeek'],
  });
export type FacultyBulkLoadInput = z.infer<typeof facultyBulkLoadSchema>;

export const availabilitySchema = z.object({
  /** Cells the person cannot teach. Everything else is available. */
  unavailable: z.array(z.object({ weekday, periodIndex: int(1, 16, 'the period') })).max(7 * 16),
});
export type AvailabilityInput = z.infer<typeof availabilitySchema>;

// ---- Infrastructure ----------------------------------------------------------------------

export const buildingSchema = z.object({
  name: nameSchema,
  code: optionalText(10),
  floors: int(1, 50, 'the number of floors').default(1),
});
export type BuildingInput = z.infer<typeof buildingSchema>;

export const roomSchema = z.object({
  code: codeSchema,
  buildingId: id,
  floor: int(-2, 50, 'the floor').default(0),
  type: choose(ROOM_TYPES),
  labCategories: z.array(text(60, 'Enter the lab category.')).default([]),
  rows: optionalInt(0, 100, 'rows'),
  seatsPerRow: optionalInt(0, 50, 'seats per row'),
  capacityOverride: optionalInt(0, 2000, 'the capacity'),
  examSeatsPerBench: optionalInt(0, 4, 'exam seats per bench'),
  ownerDepartmentId: optionalId,
  isShared: z.boolean().default(true),
  isAccessible: z.boolean().default(false),
});
export type RoomInput = z.infer<typeof roomSchema>;

// ---- Actions -------------------------------------------------------------------------------

export const promoteSchema = z.object({
  /** The term to create cohorts in (the one after the closed term). */
  toTermId: id,
  /** Batches to leave out of the promotion. */
  skipBatchIds: z.array(id).default([]),
});
export type PromoteInput = z.infer<typeof promoteSchema>;

/** List filters shared by every list endpoint (query string). */
export const listQuerySchema = z.object({
  includeArchived: z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  q: z.string().trim().max(100).optional(),
  termId: z.uuid().optional(),
  departmentId: z.uuid().optional(),
  programmeId: z.uuid().optional(),
  schemeVersionId: z.uuid().optional(),
  cohortId: z.uuid().optional(),
  batchId: z.uuid().optional(),
  semester: z.coerce.number().int().min(1).max(12).optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;
