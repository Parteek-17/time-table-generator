/**
 * Sessions, terms, cohort start-date windows, calendar windows, holidays, extra working
 * days and bell schedules. All institute-owned: institute admins manage them (ADR 0008).
 */
import type { Prisma } from '@slotwise/db';
import {
  academicSessionSchema,
  bellScheduleSchema,
  calendarWindowSchema,
  extraWorkingDaySchema,
  holidaySchema,
  sessionName,
  termCohortWindowSchema,
  termSchema,
  type AcademicSessionInput,
  type AcademicSessionRow,
  type BellScheduleInput,
  type BellScheduleRow,
  type CalendarWindowInput,
  type CalendarWindowRow,
  type ExtraWorkingDayInput,
  type ExtraWorkingDayRow,
  type HolidayInput,
  type HolidayRow,
  type TermCohortWindowInput,
  type TermCohortWindowRow,
  type TermInput,
  type TermRow,
} from '@slotwise/shared';
import type { TxClient } from '@slotwise/db';
import {
  date,
  dateOrNull,
  fieldError,
  iso,
  isoOrNull,
  requireRefs,
  type EntityDef,
} from '../masterdata/entity';

const institute = async () => null;

// ---- Scope (holidays, windows, extra days, fixed slots) -----------------------------------

interface ScopeValues {
  scopeType: 'institute' | 'department' | 'programme' | 'cohort' | 'section';
  departmentId: string | null;
  programmeId: string | null;
  cohortId: string | null;
  sectionId: string | null;
}

export function scopeRefs(tx: TxClient, v: ScopeValues) {
  return [
    ['departmentId', tx.department, v.departmentId, 'Choose a department.'],
    ['programmeId', tx.programme, v.programmeId, 'Choose a programme.'],
    ['cohortId', tx.cohort, v.cohortId, 'Choose a cohort.'],
    ['sectionId', tx.section, v.sectionId, 'Choose a section.'],
  ] as const;
}

export function scopeOf(row: ScopeValues): ScopeValues {
  return {
    scopeType: row.scopeType,
    departmentId: row.departmentId,
    programmeId: row.programmeId,
    cohortId: row.cohortId,
    sectionId: row.sectionId,
  };
}

// ---- Sessions and terms ------------------------------------------------------------------

type SessionDb = Prisma.AcademicSessionGetPayload<object>;

export const sessions: EntityDef<AcademicSessionInput, SessionDb, AcademicSessionRow> = {
  name: 'academic_session',
  path: 'sessions',
  manage: 'term.manage',
  resourceType: 'term',
  schema: academicSessionSchema,
  model: (tx) => tx.academicSession,
  orderBy: { startYear: 'desc' },
  departmentOf: institute,
  toData: async (_ctx, input) => ({
    startYear: input.startYear,
    name: input.name ?? sessionName(input.startYear),
  }),
  toInput: (row) => ({ startYear: row.startYear, name: row.name }),
  duplicate: () => 'This session already exists.',
};

const termInclude = {
  session: { select: { name: true, startYear: true } },
} satisfies Prisma.TermInclude;
type TermDb = Prisma.TermGetPayload<{ include: typeof termInclude }>;

export const terms: EntityDef<TermInput, TermDb, TermRow> = {
  name: 'term',
  path: 'terms',
  manage: 'term.manage',
  resourceType: 'term',
  schema: termSchema,
  model: (tx) => tx.term,
  include: termInclude,
  orderBy: [{ startDate: 'desc' }],
  departmentOf: institute,
  async toData({ tx }, input) {
    await requireRefs([['sessionId', tx.academicSession, input.sessionId, 'Choose a session.']]);
    return {
      sessionId: input.sessionId,
      kind: input.kind,
      label: input.label,
      startDate: date(input.startDate),
      endDate: date(input.endDate),
      minTeachingDays: input.minTeachingDays,
      status: input.status,
    };
  },
  toInput: (row) => ({
    sessionId: row.sessionId,
    kind: row.kind,
    label: row.label,
    startDate: iso(row.startDate),
    endDate: iso(row.endDate),
    minTeachingDays: row.minTeachingDays,
    status: row.status,
  }),
  extras: (row) => ({ sessionName: row.session.name, sessionStartYear: row.session.startYear }),
  // The (session, kind) unique names both columns; the one-active-term index only institute_id.
  duplicate: (target) =>
    target.includes('kind')
      ? 'This session already has a term of this kind.'
      : 'Another term is already active. Close it first, then make this one active.',
};

const windowInclude = {
  programme: { select: { code: true, totalSemesters: true } },
} satisfies Prisma.TermCohortWindowInclude;
type WindowDb = Prisma.TermCohortWindowGetPayload<{ include: typeof windowInclude }>;

export const termCohortWindows: EntityDef<TermCohortWindowInput, WindowDb, TermCohortWindowRow> = {
  name: 'term_cohort_window',
  path: 'term-cohort-windows',
  manage: 'term.manage',
  resourceType: 'term',
  schema: termCohortWindowSchema,
  model: (tx) => tx.termCohortWindow,
  include: windowInclude,
  orderBy: [{ teachingStart: 'asc' }],
  listWhere: (q) => (q.termId ? { termId: q.termId } : {}),
  departmentOf: institute,
  async toData({ tx }, input) {
    await requireRefs([
      ['termId', tx.term, input.termId, 'Choose a term.'],
      ['programmeId', tx.programme, input.programmeId, 'Choose a programme.'],
    ]);
    const programme = await tx.programme.findFirstOrThrow({ where: { id: input.programmeId } });
    if (input.semesters.some((s) => s > programme.totalSemesters)) {
      fieldError('semesters', `${programme.name} has ${programme.totalSemesters} semesters.`);
    }
    return {
      termId: input.termId,
      programmeId: input.programmeId,
      semesters: [...new Set(input.semesters)].sort((a, b) => a - b),
      entryType: input.entryType,
      teachingStart: date(input.teachingStart),
      prepHolidaysStart: dateOrNull(input.prepHolidaysStart),
      prepHolidaysEnd: dateOrNull(input.prepHolidaysEnd),
      endSemExamStart: dateOrNull(input.endSemExamStart),
    };
  },
  toInput: (row) => ({
    termId: row.termId,
    programmeId: row.programmeId,
    semesters: row.semesters,
    entryType: row.entryType,
    teachingStart: iso(row.teachingStart),
    prepHolidaysStart: isoOrNull(row.prepHolidaysStart),
    prepHolidaysEnd: isoOrNull(row.prepHolidaysEnd),
    endSemExamStart: isoOrNull(row.endSemExamStart),
  }),
  extras: (row) => ({ programmeCode: row.programme.code }),
  duplicate: () => 'This window already exists.',
};

// ---- Calendar ----------------------------------------------------------------------------

type CalendarWindowDb = Prisma.CalendarWindowGetPayload<object>;

export const calendarWindows: EntityDef<CalendarWindowInput, CalendarWindowDb, CalendarWindowRow> =
  {
    name: 'calendar_window',
    path: 'calendar-windows',
    manage: 'calendar.manage',
    resourceType: 'calendar',
    schema: calendarWindowSchema,
    model: (tx) => tx.calendarWindow,
    orderBy: [{ startDate: 'asc' }],
    listWhere: (q) => (q.termId ? { termId: q.termId } : {}),
    departmentOf: institute,
    async toData({ tx }, input) {
      await requireRefs([
        ['termId', tx.term, input.termId, 'Choose a term.'],
        ...scopeRefs(tx, input),
      ]);
      return {
        termId: input.termId,
        type: input.type,
        label: input.label,
        startDate: date(input.startDate),
        endDate: date(input.endDate),
        ...scopeOf(input),
      };
    },
    toInput: (row) => ({
      termId: row.termId,
      type: row.type,
      label: row.label,
      startDate: iso(row.startDate),
      endDate: iso(row.endDate),
      ...scopeOf(row),
    }),
    duplicate: () => 'This window already exists.',
  };

type HolidayDb = Prisma.HolidayGetPayload<object>;

export const holidays: EntityDef<HolidayInput, HolidayDb, HolidayRow> = {
  name: 'holiday',
  path: 'holidays',
  manage: 'calendar.manage',
  resourceType: 'calendar',
  schema: holidaySchema,
  model: (tx) => tx.holiday,
  orderBy: [{ startDate: 'asc' }],
  // Holidays are dates, not tied to a term; the calendar page shows those within the term.
  departmentOf: institute,
  async toData({ tx }, input) {
    await requireRefs(scopeRefs(tx, input));
    return {
      name: input.name,
      startDate: date(input.startDate),
      endDate: date(input.endDate),
      ...scopeOf(input),
    };
  },
  toInput: (row) => ({
    name: row.name,
    startDate: iso(row.startDate),
    endDate: iso(row.endDate),
    ...scopeOf(row),
  }),
  duplicate: () => 'This holiday already exists.',
};

type ExtraDayDb = Prisma.ExtraWorkingDayGetPayload<object>;

export const extraWorkingDays: EntityDef<ExtraWorkingDayInput, ExtraDayDb, ExtraWorkingDayRow> = {
  name: 'extra_working_day',
  path: 'extra-working-days',
  manage: 'calendar.manage',
  resourceType: 'calendar',
  schema: extraWorkingDaySchema,
  model: (tx) => tx.extraWorkingDay,
  orderBy: [{ date: 'asc' }],
  listWhere: (q) => (q.termId ? { termId: q.termId } : {}),
  departmentOf: institute,
  async toData({ tx }, input) {
    await requireRefs([
      ['termId', tx.term, input.termId, 'Choose a term.'],
      ...scopeRefs(tx, input),
    ]);
    return {
      termId: input.termId,
      date: date(input.date),
      followsWeekday: input.followsWeekday,
      ...scopeOf(input),
    };
  },
  toInput: (row) => ({
    termId: row.termId,
    date: iso(row.date),
    followsWeekday: row.followsWeekday,
    ...scopeOf(row),
  }),
  duplicate: () => 'This day is already a working day.',
};

// ---- Bell schedules ----------------------------------------------------------------------

const bellInclude = {
  periods: { orderBy: { index: 'asc' } },
  breaks: { orderBy: { afterPeriodIndex: 'asc' } },
  programmes: true,
} satisfies Prisma.BellScheduleInclude;
type BellDb = Prisma.BellScheduleGetPayload<{ include: typeof bellInclude }>;

export const bellSchedules: EntityDef<BellScheduleInput, BellDb, BellScheduleRow> = {
  name: 'bell_schedule',
  path: 'bell-schedules',
  manage: 'calendar.manage',
  resourceType: 'bell_schedule',
  schema: bellScheduleSchema,
  model: (tx) => tx.bellSchedule,
  include: bellInclude,
  orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  departmentOf: institute,
  async toData({ tx }, input, existing) {
    await requireRefs(
      input.programmes.map(
        (p) => ['programmes', tx.programme, p.programmeId, 'Choose a programme.'] as const,
      ),
    );
    // Only one default: making this one the default unsets the others.
    if (input.isDefault) {
      await tx.bellSchedule.updateMany({
        where: { isDefault: true, ...(existing ? { id: { not: existing.id } } : {}) },
        data: { isDefault: false },
      });
    }
    return {
      name: input.name,
      workingDays: [...new Set(input.workingDays)].sort(),
      isDefault: input.isDefault,
    };
  },
  async afterWrite({ tx, tenant }, row, input) {
    const instituteId = tenant.institute.id;
    await tx.bellPeriod.deleteMany({ where: { bellScheduleId: row.id } });
    await tx.bellBreak.deleteMany({ where: { bellScheduleId: row.id } });
    await tx.bellScheduleProgramme.deleteMany({ where: { bellScheduleId: row.id } });
    await tx.bellPeriod.createMany({
      data: input.periods.map((p) => ({ instituteId, bellScheduleId: row.id, ...p })),
    });
    await tx.bellBreak.createMany({
      data: input.breaks.map((b) => ({ instituteId, bellScheduleId: row.id, ...b })),
    });
    await tx.bellScheduleProgramme.createMany({
      data: input.programmes.map((p) => ({ instituteId, bellScheduleId: row.id, ...p })),
    });
  },
  toInput: (row) => ({
    name: row.name,
    workingDays: row.workingDays,
    isDefault: row.isDefault,
    periods: row.periods.map((p) => ({
      index: p.index,
      label: p.label,
      startMinute: p.startMinute,
      endMinute: p.endMinute,
    })),
    breaks: row.breaks.map((b) => ({
      label: b.label,
      afterPeriodIndex: b.afterPeriodIndex,
      minutes: b.minutes,
    })),
    programmes: row.programmes.map((p) => ({ programmeId: p.programmeId, semesters: p.semesters })),
  }),
  duplicate: () => 'Another bell schedule is already the default.',
};
