/**
 * Planning helpers shared by the readiness check, the teaching-assignment grid and (later)
 * the Phase 2 solver input: which courses a cohort takes, who must be taught each L/T/P,
 * faculty load, and how many periods a section has free.
 */
import { periodsPerWeek, type BellScheduleShape } from './bell';
import type { Component, CourseType, RoomType } from './constants';
import {
  componentPeriods,
  groupingFor,
  isElective,
  weeklyPeriods,
  type SchedulableCourse,
} from './courses';
import type { EntryType } from './semester';
import { scopeApplies, type ScopedRow, type ScopeTarget } from './scope';

export interface PlanCourse extends SchedulableCourse {
  id: string;
  code: string;
  title: string;
  shortName: string;
  schemeVersionId: string;
  semester: number;
  /** Empty = common to every branch of the programme. */
  branchIds: readonly string[];
  type: CourseType;
  electiveGroup: string | null;
  roomType: RoomType | null;
  labCategory: string | null;
  labBlockLength: number;
}

export interface PlanCohort {
  id: string;
  displayCode: string;
  semester: number;
  isRunning: boolean;
  entryType: EntryType;
  schemeVersionId: string;
  programmeId: string;
  branchId: string;
  departmentId: string;
  /** Lateral-entry cohort sitting in another cohort's sections. */
  joinsCohortId: string | null;
}

export interface PlanSection {
  id: string;
  cohortId: string;
  name: string;
  displayName: string;
  strength: number;
}

export interface PlanSubGroup {
  id: string;
  sectionId: string;
  name: string;
  strength: number;
}

export interface PlanElectiveSection {
  id: string;
  courseId: string;
  name: string;
  strength: number;
  /** Regular sections whose students make up this elective section. */
  sourceSectionIds: readonly string[];
}

export type AssignmentTargetKind = 'section' | 'subgroup' | 'elective_section';

export interface PlanAssignment {
  id: string;
  courseId: string;
  component: Component;
  target: AssignmentTargetKind;
  sectionId: string | null;
  subGroupId: string | null;
  electiveSectionId: string | null;
  faculty: readonly { facultyId: string; role: 'main' | 'co_teacher' | 'ta' }[];
}

export interface Target {
  kind: AssignmentTargetKind;
  id: string;
  name: string;
  strength: number;
}

/** Courses a cohort takes: its scheme version, its semester, its branch or common. */
export function coursesForCohort(
  cohort: Pick<PlanCohort, 'schemeVersionId' | 'semester' | 'branchId'>,
  courses: readonly PlanCourse[],
): PlanCourse[] {
  return courses.filter(
    (c) =>
      c.schemeVersionId === cohort.schemeVersionId &&
      c.semester === cohort.semester &&
      (c.branchIds.length === 0 || c.branchIds.includes(cohort.branchId)),
  );
}

/** Indexes the group data once, for repeated lookups. */
export class GroupIndex {
  private readonly sectionsByCohort = new Map<string, PlanSection[]>();
  private readonly subGroupsBySection = new Map<string, PlanSubGroup[]>();
  private readonly electivesByCourse = new Map<string, PlanElectiveSection[]>();

  constructor(
    sections: readonly PlanSection[],
    subGroups: readonly PlanSubGroup[],
    electiveSections: readonly PlanElectiveSection[],
  ) {
    for (const s of sections) push(this.sectionsByCohort, s.cohortId, s);
    for (const g of subGroups) push(this.subGroupsBySection, g.sectionId, g);
    for (const e of electiveSections) push(this.electivesByCourse, e.courseId, e);
  }

  sections(cohortId: string): PlanSection[] {
    return this.sectionsByCohort.get(cohortId) ?? [];
  }

  subGroups(sectionId: string): PlanSubGroup[] {
    return this.subGroupsBySection.get(sectionId) ?? [];
  }

  /** Elective sections of a course drawing students from any of these sections. */
  electiveSections(courseId: string, fromSectionIds: readonly string[]): PlanElectiveSection[] {
    return (this.electivesByCourse.get(courseId) ?? []).filter((e) =>
      e.sourceSectionIds.some((id) => fromSectionIds.includes(id)),
    );
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * Who must be taught this component of a course in a cohort. Electives: their elective
 * sections (none = not offered to this cohort this term). Otherwise each section, or each
 * sub-group when the component is taken by sub-groups (the section itself if it has none).
 */
export function requiredTargets(
  course: PlanCourse,
  component: Component,
  sections: readonly PlanSection[],
  groups: GroupIndex,
): Target[] {
  if (isElective(course)) {
    return groups
      .electiveSections(
        course.id,
        sections.map((s) => s.id),
      )
      .map((e) => ({ kind: 'elective_section', id: e.id, name: e.name, strength: e.strength }));
  }
  const bySubgroup = groupingFor(course, component) === 'subgroup';
  return sections.flatMap((s): Target[] => {
    const subs = bySubgroup ? groups.subGroups(s.id) : [];
    if (subs.length === 0) {
      return [{ kind: 'section', id: s.id, name: s.displayName, strength: s.strength }];
    }
    return subs.map((g) => ({ kind: 'subgroup', id: g.id, name: g.name, strength: g.strength }));
  });
}

/** Key identifying "this component of this course for this target". */
export function assignmentKey(
  courseId: string,
  component: Component,
  kind: AssignmentTargetKind,
  targetId: string,
): string {
  return `${courseId}|${component}|${kind}|${targetId}`;
}

export function keyOfAssignment(a: PlanAssignment): string {
  const targetId = a.sectionId ?? a.subGroupId ?? a.electiveSectionId ?? '';
  return assignmentKey(a.courseId, a.component, a.target, targetId);
}

/**
 * Assigned periods per week for each faculty member: the L, T or P of the course for every
 * assignment they are on. Co-teachers and TAs are in the room too, so they count fully.
 */
export function facultyLoad(
  assignments: readonly PlanAssignment[],
  coursesById: ReadonlyMap<
    string,
    Pick<PlanCourse, 'lectures' | 'tutorials' | 'practicals' | 'isScheduled'>
  >,
): Map<string, number> {
  const load = new Map<string, number>();
  for (const a of assignments) {
    const course = coursesById.get(a.courseId);
    if (!course || !course.isScheduled) continue;
    const periods = componentPeriods(course, a.component);
    for (const f of a.faculty) load.set(f.facultyId, (load.get(f.facultyId) ?? 0) + periods);
  }
  return load;
}

export interface FixedSlotCells extends ScopedRow {
  weekday: number;
  startPeriodIndex: number;
  endPeriodIndex: number;
}

/** Distinct (weekday, period) cells blocked by fixed slots for this section. */
export function blockedCells(
  schedule: BellScheduleShape,
  fixedSlots: readonly FixedSlotCells[],
  target: ScopeTarget,
): number {
  const days = new Set(schedule.workingDays);
  const periodIndexes = new Set(schedule.periods.map((p) => p.index));
  const cells = new Set<string>();
  for (const slot of fixedSlots) {
    if (!days.has(slot.weekday) || !scopeApplies(slot, target)) continue;
    for (let p = slot.startPeriodIndex; p <= slot.endPeriodIndex; p++) {
      if (periodIndexes.has(p)) cells.add(`${slot.weekday}:${p}`);
    }
  }
  return cells.size;
}

/** Periods a section can be taught in a week: working days × periods − fixed slots. */
export function availablePeriods(
  schedule: BellScheduleShape,
  fixedSlots: readonly FixedSlotCells[],
  target: ScopeTarget,
): number {
  return periodsPerWeek(schedule) - blockedCells(schedule, fixedSlots, target);
}

/**
 * Periods a section's students are in class each week (sub-groups taught in parallel).
 * Electives in the same group run in parallel, so a group counts once (its longest course),
 * and only if one of its courses is offered to this section.
 */
export function sectionDemand(
  section: Pick<PlanSection, 'id'>,
  cohortCourses: readonly PlanCourse[],
  groups: GroupIndex,
): number {
  let total = 0;
  const electiveGroups = new Map<string, number>();
  for (const course of cohortCourses) {
    const periods = weeklyPeriods(course);
    if (periods === 0) continue;
    if (!isElective(course)) {
      total += periods;
      continue;
    }
    if (groups.electiveSections(course.id, [section.id]).length === 0) continue;
    const key = course.electiveGroup ?? course.id;
    electiveGroups.set(key, Math.max(electiveGroups.get(key) ?? 0, periods));
  }
  for (const periods of electiveGroups.values()) total += periods;
  return total;
}
