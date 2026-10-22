/**
 * "Ready to generate?" Runs the seven checks of the Phase 1 brief over a snapshot of one
 * term's master data. Pure: the API loads the snapshot, the web shows the result, Phase 2
 * refuses to generate while `ready` is false.
 *
 * Errors block generation. Warnings (calendar shortfall) do not (ADR 0007).
 */
import { blockStarts, validateBellSchedule, type BellScheduleShape } from './bell';
import {
  suggestWorkingSaturdays,
  teachingDays,
  teachingEndFor,
  toDayNumber,
  type DateRange,
  type IsoDate,
  type WorkingSaturday,
} from './calendar';
import { COMPONENT_LETTER, type Component } from './constants';
import { activeComponents, classCapacity, roomFits, roomNeedFor, type RoomNeed } from './courses';
import { subGroupsAddUp } from './groups';
import {
  assignmentKey,
  availablePeriods,
  blockedCells,
  coursesForCohort,
  facultyLoad,
  GroupIndex,
  keyOfAssignment,
  requiredTargets,
  sectionDemand,
  type FixedSlotCells,
  type PlanAssignment,
  type PlanCohort,
  type PlanCourse,
  type PlanElectiveSection,
  type PlanSection,
  type PlanSubGroup,
} from './planning';
import { scopeApplies, type ScopedRow, type ScopeTarget } from './scope';
import type { EntryType } from './semester';
import type { RoomType } from './constants';

export const READINESS_CATEGORIES = [
  'setup',
  'sections',
  'assignments',
  'load',
  'periods',
  'rooms',
  'calendar',
] as const;
export type ReadinessCategory = (typeof READINESS_CATEGORIES)[number];

/** Screen that fixes an issue; the web maps it to a route. */
export type FixScreen =
  'terms' | 'bell-schedules' | 'cohort' | 'teaching' | 'faculty' | 'rooms' | 'calendar' | 'scheme';

export interface ReadinessIssue {
  category: ReadinessCategory;
  severity: 'error' | 'warning';
  /** Stable code, for i18n and tests. */
  code: string;
  /** Plain-language English message (the web may translate from code + params). */
  message: string;
  fix: { screen: FixScreen; id?: string };
  params?: Readonly<Record<string, string | number>>;
}

export interface SnapshotBellSchedule extends BellScheduleShape {
  id: string;
  name: string;
  isDefault: boolean;
  /** Programmes (optionally only some semesters) that use this schedule instead of the default. */
  overrides: readonly { programmeId: string; semesters: readonly number[] }[];
}

export interface SnapshotFaculty {
  id: string;
  name: string;
  shortCode: string;
  maxPeriodsPerWeek: number;
  /** Number of (weekday, period) cells marked unavailable. */
  unavailableCells: number;
}

export interface SnapshotRoom {
  id: string;
  code: string;
  type: RoomType;
  labCategories: readonly string[];
  rows: number | null;
  seatsPerRow: number | null;
  capacityOverride: number | null;
}

export interface SnapshotCohortWindow {
  id: string;
  programmeId: string;
  semesters: readonly number[];
  entryType: EntryType | null;
  teachingStart: IsoDate;
  prepHolidaysStart: IsoDate | null;
  endSemExamStart: IsoDate | null;
}

export interface ReadinessSnapshot {
  term: {
    id: string;
    label: string;
    status: 'planning' | 'active' | 'closed';
    startDate: IsoDate;
    endDate: IsoDate;
    minTeachingDays: number;
  } | null;
  /** Whether the institute has any active term (it may be another one). */
  hasActiveTerm: boolean;
  bellSchedules: readonly SnapshotBellSchedule[];
  cohorts: readonly PlanCohort[];
  sections: readonly PlanSection[];
  subGroups: readonly PlanSubGroup[];
  electiveSections: readonly PlanElectiveSection[];
  courses: readonly PlanCourse[];
  assignments: readonly PlanAssignment[];
  faculty: readonly SnapshotFaculty[];
  rooms: readonly SnapshotRoom[];
  fixedSlots: readonly FixedSlotCells[];
  cohortWindows: readonly SnapshotCohortWindow[];
  holidays: readonly (ScopedRow & DateRange)[];
  /** Mid-sem exams, orientation, vacation, training (all non-teaching). */
  calendarWindows: readonly (ScopedRow & DateRange)[];
  extraWorkingDays: readonly (ScopedRow & { date: IsoDate })[];
}

export interface FacultyLoadRow {
  facultyId: string;
  name: string;
  shortCode: string;
  assigned: number;
  max: number;
  /** over: above max; under: below half of max. */
  status: 'over' | 'under' | 'ok';
}

export interface CohortTeachingDays {
  cohortId: string;
  displayCode: string;
  teachingDays: number;
  minimum: number;
  suggestedSaturdays: WorkingSaturday[];
}

export interface ReadinessResult {
  ready: boolean;
  errorCount: number;
  warningCount: number;
  byCategory: Record<ReadinessCategory, { errors: number; warnings: number }>;
  issues: ReadinessIssue[];
  facultyLoad: FacultyLoadRow[];
  teachingDays: CohortTeachingDays[];
}

/** The bell schedule a cohort follows: a programme override, else the default. */
export function bellScheduleFor(
  cohort: Pick<PlanCohort, 'programmeId' | 'semester'>,
  schedules: readonly SnapshotBellSchedule[],
): SnapshotBellSchedule | null {
  const override = schedules.find((s) =>
    s.overrides.some(
      (o) =>
        o.programmeId === cohort.programmeId &&
        (o.semesters.length === 0 || o.semesters.includes(cohort.semester)),
    ),
  );
  return override ?? schedules.find((s) => s.isDefault) ?? null;
}

/** The most specific cohort start-date window for a cohort, if any. */
export function windowFor(
  cohort: Pick<PlanCohort, 'programmeId' | 'semester' | 'entryType'>,
  windows: readonly SnapshotCohortWindow[],
): SnapshotCohortWindow | null {
  let best: SnapshotCohortWindow | null = null;
  let bestScore = -1;
  for (const w of windows) {
    if (w.programmeId !== cohort.programmeId) continue;
    if (w.semesters.length > 0 && !w.semesters.includes(cohort.semester)) continue;
    if (w.entryType != null && w.entryType !== cohort.entryType) continue;
    const score = (w.semesters.length > 0 ? 2 : 0) + (w.entryType != null ? 1 : 0);
    if (score > bestScore) {
      best = w;
      bestScore = score;
    }
  }
  return best;
}

function targetOf(cohort: PlanCohort, sectionId?: string): ScopeTarget {
  return {
    departmentId: cohort.departmentId,
    programmeId: cohort.programmeId,
    cohortId: cohort.id,
    sectionId,
  };
}

function listNames(names: readonly string[], max = 6): string {
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

function courseLabel(course: PlanCourse): string {
  return `${course.code} ${course.shortName}`;
}

export function readiness(snapshot: ReadinessSnapshot): ReadinessResult {
  const issues: ReadinessIssue[] = [];
  const add = (issue: ReadinessIssue) => issues.push(issue);

  const groups = new GroupIndex(snapshot.sections, snapshot.subGroups, snapshot.electiveSections);
  const coursesById = new Map(snapshot.courses.map((c) => [c.id, c]));
  const cohortsById = new Map(snapshot.cohorts.map((c) => [c.id, c]));
  const running = snapshot.cohorts.filter((c) => c.isRunning);
  /** Cohorts with their own sections (lateral-entry cohorts may sit in others' sections). */
  const teaching = running.filter((c) => c.joinsCohortId == null);

  // 1. Term and bell schedule -------------------------------------------------------
  const term = snapshot.term;
  if (!snapshot.hasActiveTerm) {
    add({
      category: 'setup',
      severity: 'error',
      code: 'no_active_term',
      message: 'No term is active. Mark the current term as active.',
      fix: { screen: 'terms' },
    });
  } else if (term && term.status !== 'active') {
    add({
      category: 'setup',
      severity: 'warning',
      code: 'term_not_active',
      message: `${term.label} is not the active term. You are checking a term that is being planned.`,
      fix: { screen: 'terms', id: term.id },
    });
  }
  const defaultBell = snapshot.bellSchedules.find((b) => b.isDefault) ?? null;
  if (!defaultBell) {
    add({
      category: 'setup',
      severity: 'error',
      code: 'no_bell_schedule',
      message: 'Set up a bell schedule: working days, periods and breaks.',
      fix: { screen: 'bell-schedules' },
    });
  }
  for (const bell of snapshot.bellSchedules) {
    for (const problem of validateBellSchedule(bell)) {
      add({
        category: 'setup',
        severity: 'error',
        code: `bell_${problem.code}`,
        message: `${bell.name}: ${problem.message}`,
        fix: { screen: 'bell-schedules', id: bell.id },
      });
    }
  }

  // Lab blocks must fit somewhere in each cohort's day.
  const blockProblems = new Set<string>();
  for (const cohort of teaching) {
    const bell = bellScheduleFor(cohort, snapshot.bellSchedules);
    if (!bell) continue;
    for (const course of coursesForCohort(cohort, snapshot.courses)) {
      if (!course.isScheduled || course.practicals === 0) continue;
      const length = Math.min(course.labBlockLength, course.practicals);
      const key = `${bell.id}|${length}`;
      if (blockProblems.has(key) || blockStarts(bell, length).length > 0) continue;
      blockProblems.add(key);
      add({
        category: 'setup',
        severity: 'error',
        code: 'lab_block_does_not_fit',
        message: `A ${length}-period lab (e.g. ${courseLabel(course)}) does not fit anywhere in ${bell.name} without crossing a long break.`,
        fix: { screen: 'bell-schedules', id: bell.id },
        params: { length },
      });
    }
  }

  // 2. Sections and sub-groups ----------------------------------------------------------
  for (const cohort of running) {
    if (cohort.joinsCohortId != null) {
      const host = cohortsById.get(cohort.joinsCohortId);
      if (!host || !host.isRunning) {
        add({
          category: 'sections',
          severity: 'error',
          code: 'joins_missing_cohort',
          message: `${cohort.displayCode} joins the sections of a cohort that is not running this term.`,
          fix: { screen: 'cohort', id: cohort.id },
        });
      }
      continue;
    }
    const sections = groups.sections(cohort.id);
    if (sections.length === 0) {
      add({
        category: 'sections',
        severity: 'error',
        code: 'cohort_without_sections',
        message: `${cohort.displayCode} has no sections yet.`,
        fix: { screen: 'cohort', id: cohort.id },
      });
      continue;
    }
    for (const section of sections) {
      const subs = groups.subGroups(section.id);
      if (
        !subGroupsAddUp(
          section.strength,
          subs.map((g) => g.strength),
        )
      ) {
        const sum = subs.reduce((a, g) => a + g.strength, 0);
        add({
          category: 'sections',
          severity: 'error',
          code: 'subgroups_dont_add_up',
          message: `${section.displayName} (${cohort.displayCode}) has ${section.strength} students but its sub-groups add up to ${sum}.`,
          fix: { screen: 'cohort', id: cohort.id },
          params: { section: section.displayName, strength: section.strength, sum },
        });
      }
    }
  }

  // 3. Teaching assignments -----------------------------------------------------------
  const assigned = new Set(
    snapshot.assignments.filter((a) => a.faculty.length > 0).map(keyOfAssignment),
  );
  for (const cohort of teaching) {
    const sections = groups.sections(cohort.id);
    if (sections.length === 0) continue;
    for (const course of coursesForCohort(cohort, snapshot.courses)) {
      for (const component of activeComponents(course)) {
        const missing = requiredTargets(course, component, sections, groups).filter(
          (t) => !assigned.has(assignmentKey(course.id, component, t.kind, t.id)),
        );
        if (missing.length === 0) continue;
        add({
          category: 'assignments',
          severity: 'error',
          code: 'missing_assignment',
          message: `${cohort.displayCode}: no teacher for ${courseLabel(course)} (${COMPONENT_LETTER[component]}) in ${listNames(missing.map((t) => t.name))}.`,
          fix: { screen: 'teaching', id: cohort.id },
          params: {
            course: course.code,
            component: COMPONENT_LETTER[component],
            count: missing.length,
          },
        });
      }
    }
  }

  // 4. Faculty load -------------------------------------------------------------------
  const load = facultyLoad(snapshot.assignments, coursesById);
  const weekCells = defaultBell ? defaultBell.workingDays.length * defaultBell.periods.length : 0;
  const facultyRows: FacultyLoadRow[] = snapshot.faculty.map((f) => {
    const assignedPeriods = load.get(f.id) ?? 0;
    const status =
      assignedPeriods > f.maxPeriodsPerWeek
        ? 'over'
        : assignedPeriods < f.maxPeriodsPerWeek / 2
          ? 'under'
          : 'ok';
    if (status === 'over') {
      add({
        category: 'load',
        severity: 'error',
        code: 'faculty_overloaded',
        message: `${f.name} (${f.shortCode}) has ${assignedPeriods} periods a week; their limit is ${f.maxPeriodsPerWeek}.`,
        fix: { screen: 'faculty', id: f.id },
        params: { assigned: assignedPeriods, max: f.maxPeriodsPerWeek },
      });
    }
    const free = weekCells - f.unavailableCells;
    if (defaultBell && assignedPeriods > free) {
      add({
        category: 'load',
        severity: 'error',
        code: 'faculty_not_enough_free_periods',
        message: `${f.name} (${f.shortCode}) has ${assignedPeriods} periods to teach but is available for only ${free}.`,
        fix: { screen: 'faculty', id: f.id },
        params: { assigned: assignedPeriods, free },
      });
    }
    return {
      facultyId: f.id,
      name: f.name,
      shortCode: f.shortCode,
      assigned: assignedPeriods,
      max: f.maxPeriodsPerWeek,
      status,
    };
  });

  // 5. Periods per section ------------------------------------------------------------
  for (const cohort of teaching) {
    const bell = bellScheduleFor(cohort, snapshot.bellSchedules);
    if (!bell) continue;
    const cohortCourses = coursesForCohort(cohort, snapshot.courses);
    for (const section of groups.sections(cohort.id)) {
      const target = targetOf(cohort, section.id);
      const demand = sectionDemand(section, cohortCourses, groups);
      const available = availablePeriods(bell, snapshot.fixedSlots, target);
      if (demand <= available) continue;
      const fixed = blockedCells(bell, snapshot.fixedSlots, target);
      add({
        category: 'periods',
        severity: 'error',
        code: 'section_over_capacity',
        message: `${section.displayName} (${cohort.displayCode}) needs ${demand} periods a week but only ${available} are free (${bell.workingDays.length} days × ${bell.periods.length} periods${fixed > 0 ? `, minus ${fixed} fixed` : ''}).`,
        fix: { screen: 'scheme' },
        params: { demand, available },
      });
    }
  }

  // 6. Rooms --------------------------------------------------------------------------
  interface Need extends RoomNeed {
    strength: number;
    example: string;
  }
  const needs = new Map<string, Need>();
  for (const cohort of teaching) {
    const sections = groups.sections(cohort.id);
    for (const course of coursesForCohort(cohort, snapshot.courses)) {
      for (const component of activeComponents(course) as Component[]) {
        const need = roomNeedFor(course, component);
        const largest = Math.max(
          0,
          ...requiredTargets(course, component, sections, groups).map((t) => t.strength),
        );
        const key = `${need.type}|${need.labCategory?.toLowerCase() ?? ''}`;
        const current = needs.get(key);
        if (!current || largest > current.strength) {
          needs.set(key, {
            ...need,
            strength: largest,
            example: `${courseLabel(course)} for ${cohort.displayCode}`,
          });
        }
      }
    }
  }
  for (const need of needs.values()) {
    const fitting = snapshot.rooms.filter((r) => roomFits(r, need));
    const what = need.labCategory
      ? /\blab$/i.test(need.labCategory.trim())
        ? need.labCategory.trim()
        : `${need.labCategory.trim()} lab`
      : roomTypeName(need.type);
    if (fitting.length === 0) {
      add({
        category: 'rooms',
        severity: 'error',
        code: 'no_room_of_type',
        message: `There is no ${what}. ${need.example} needs one.`,
        fix: { screen: 'rooms' },
        params: { type: need.type, labCategory: need.labCategory ?? '' },
      });
      continue;
    }
    const biggest = Math.max(...fitting.map(classCapacity));
    if (biggest < need.strength) {
      add({
        category: 'rooms',
        severity: 'error',
        code: 'no_room_big_enough',
        message: `The largest ${what} seats ${biggest}, but ${need.example} has ${need.strength} students.`,
        fix: { screen: 'rooms' },
        params: { capacity: biggest, needed: need.strength },
      });
    }
  }

  // 7. Calendar -----------------------------------------------------------------------
  const daysRows: CohortTeachingDays[] = [];
  if (term) {
    if (toDayNumber(term.endDate) < toDayNumber(term.startDate)) {
      add({
        category: 'calendar',
        severity: 'error',
        code: 'term_dates_invalid',
        message: `${term.label} ends before it starts.`,
        fix: { screen: 'terms', id: term.id },
      });
    } else {
      // One warning per group of cohorts with the same result (e.g. "all 2nd year onwards").
      const shortGroups = new Map<string, { cohorts: string[]; row: CohortTeachingDays }>();
      for (const cohort of running) {
        const bell = bellScheduleFor(cohort, snapshot.bellSchedules);
        if (!bell) continue;
        const window = windowFor(cohort, snapshot.cohortWindows);
        const target = targetOf(cohort);
        const input = {
          teachingStart: window?.teachingStart ?? term.startDate,
          teachingEnd: teachingEndFor({
            termEnd: term.endDate,
            prepHolidaysStart: window?.prepHolidaysStart,
            endSemExamStart: window?.endSemExamStart,
          }),
          workingDays: bell.workingDays,
          holidays: snapshot.holidays.filter((h) => scopeApplies(h, target)),
          nonTeachingWindows: snapshot.calendarWindows.filter((w) => scopeApplies(w, target)),
          extraWorkingDays: snapshot.extraWorkingDays
            .filter((d) => scopeApplies(d, target))
            .map((d) => d.date),
        };
        const days = teachingDays(input);
        const shortfall = term.minTeachingDays - days;
        const row: CohortTeachingDays = {
          cohortId: cohort.id,
          displayCode: cohort.displayCode,
          teachingDays: days,
          minimum: term.minTeachingDays,
          suggestedSaturdays: suggestWorkingSaturdays(input, shortfall),
        };
        daysRows.push(row);
        if (shortfall <= 0) continue;
        // Same dates and same count (e.g. every first-year cohort) → one warning.
        const key = `${input.teachingStart}|${input.teachingEnd}|${days}`;
        const group = shortGroups.get(key);
        if (group) group.cohorts.push(cohort.displayCode);
        else shortGroups.set(key, { cohorts: [cohort.displayCode], row });
      }
      for (const { cohorts, row } of shortGroups.values()) {
        const shortBy = row.minimum - row.teachingDays;
        const saturdays = row.suggestedSaturdays.length;
        add({
          category: 'calendar',
          severity: 'warning',
          code: 'teaching_days_short',
          message:
            `${listNames(cohorts)}: ${row.teachingDays} teaching days, ${shortBy} short of ${row.minimum}.` +
            (saturdays > 0
              ? ` Make ${saturdays} Saturday${saturdays === 1 ? '' : 's'} working days to catch up.`
              : ''),
          fix: { screen: 'calendar', id: term.id },
          params: { teachingDays: row.teachingDays, minimum: row.minimum, saturdays },
        });
      }
    }
  }

  const byCategory = Object.fromEntries(
    READINESS_CATEGORIES.map((c) => [c, { errors: 0, warnings: 0 }]),
  ) as Record<ReadinessCategory, { errors: number; warnings: number }>;
  for (const issue of issues) {
    if (issue.severity === 'error') byCategory[issue.category].errors++;
    else byCategory[issue.category].warnings++;
  }
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  return {
    ready: errorCount === 0,
    errorCount,
    warningCount: issues.length - errorCount,
    byCategory,
    issues,
    facultyLoad: facultyRows,
    teachingDays: daysRows,
  };
}

function roomTypeName(type: RoomType): string {
  switch (type) {
    case 'lecture':
      return 'lecture room';
    case 'tutorial':
      return 'tutorial or lecture room';
    case 'lab':
      return 'lab';
    case 'seminar':
      return 'seminar hall';
    case 'drawing_hall':
      return 'drawing hall';
    case 'workshop':
      return 'workshop';
  }
}
