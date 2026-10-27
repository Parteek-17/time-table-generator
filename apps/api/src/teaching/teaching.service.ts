import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { loadReadinessSnapshot, type TxClient } from '@slotwise/db';
import {
  activeComponents,
  assignmentKey,
  componentPeriods,
  coursesForCohort,
  facultyLoad,
  GroupIndex,
  keyOfAssignment,
  requiredTargets,
  type PlanAssignment,
  type PlanCohort,
  type ReadinessSnapshot,
  type SubjectMentorInput,
  type TeachingCellDto,
  type TeachingCellInput,
  type TeachingCohortDto,
  type TeachingFacultyDto,
  type TeachingGridDto,
  type TeachingRowDto,
} from '@slotwise/shared';
import type { Tenant } from '../common/request-context';
import { fieldError, type EntityContext } from '../masterdata/entity';
import { MasterDataService, SNAPSHOT_TX } from '../masterdata/masterdata.service';

const live = { deletedAt: null };

interface FacultyInfo {
  id: string;
  name: string;
  shortCode: string;
  maxPeriodsPerWeek: number;
  homeDepartmentId: string;
  homeDepartment: { code: string };
}

/**
 * The teaching grid (docs/phase1/plan.md screen 18): for one cohort, every course part
 * (L, T, P) × the sections, sub-groups or elective sections that need a teacher, with each
 * teacher's load across all departments this term. Writes check can() with the cohort's
 * department and the teachers' home departments (service-department hods, ADR 0008).
 */
@Injectable()
export class TeachingService {
  constructor(private readonly md: MasterDataService) {}

  /** Running cohorts of a term with how many cells still need a teacher. */
  overview(tenant: Tenant, termId: string): Promise<TeachingCohortDto[]> {
    return this.run(tenant, async ({ tx }) => {
      const snapshot = await loadReadinessSnapshot(tx, termId);
      if (!snapshot.term) throw new NotFoundException('We could not find this term.');
      const groups = groupsOf(snapshot);
      const byId = new Map(snapshot.cohorts.map((c) => [c.id, c]));
      return snapshot.cohorts
        .filter((c) => c.isRunning)
        .map((c) => {
          const rows = c.joinsCohortId ? [] : gridRows(c, snapshot, groups);
          const cells = rows.flatMap((r) => r.cells);
          return {
            id: c.id,
            displayCode: c.displayCode,
            semester: c.semester,
            departmentId: c.departmentId,
            sections: groups.sections(c.id).length,
            cells: cells.length,
            missing: cells.filter((x) => !x.facultyId).length,
            joinsDisplayCode: c.joinsCohortId
              ? (byId.get(c.joinsCohortId)?.displayCode ?? null)
              : null,
          };
        });
    });
  }

  grid(tenant: Tenant, cohortId: string): Promise<TeachingGridDto> {
    return this.run(tenant, async ({ tx }) => this.load(tx, cohortId));
  }

  /** Sets (or clears) the teachers of one cell, then returns the refreshed grid. */
  setCell(tenant: Tenant, cohortId: string, input: TeachingCellInput): Promise<TeachingGridDto> {
    return this.run(tenant, async (ctx) => {
      const { tx } = ctx;
      const { cohort, snapshot } = await this.cohortAndSnapshot(tx, cohortId);
      if (cohort.joinsCohortId) {
        throw new BadRequestException(
          `${cohort.displayCode} sits in another cohort’s sections. Pick its teachers there.`,
        );
      }
      const rows = gridRows(cohort, snapshot, groupsOf(snapshot));
      const row = rows.find(
        (r) => r.courseId === input.courseId && r.component === input.component,
      );
      const cell = row?.cells.find(
        (c) => c.target === input.target && c.targetId === input.targetId,
      );
      if (!row || !cell) {
        throw new BadRequestException(
          'This course and section are not part of the cohort’s grid. Reload the page.',
        );
      }

      const mainIds = input.facultyId ? [input.facultyId] : [];
      const coIds = [...new Set(input.coTeacherIds)].filter((id) => !mainIds.includes(id)).sort();
      const faculty = await this.faculty(tx, [...mainIds, ...coIds]);
      if (input.facultyId && !faculty.has(input.facultyId))
        fieldError('facultyId', 'Choose a teacher from the list.');
      if (coIds.some((id) => !faculty.has(id)))
        fieldError('coTeacherIds', 'Choose co-teachers from the list.');

      const oldIds = [cell.facultyId, ...cell.coTeacherIds].filter((x): x is string => x != null);
      const oldFaculty = await this.faculty(tx, oldIds);
      // Both the teachers taken off and the ones put on must be within the user's rights.
      for (const [ids, from] of [
        [oldIds, oldFaculty],
        [[...mainIds, ...coIds], faculty],
      ] as const) {
        if (ids.length === 0) continue;
        this.md.assertCan(
          tenant,
          'teaching.manage',
          this.md.resource(tenant, 'teaching_assignment', cohort.departmentId, {
            facultyDepartmentIds: ids.map((id) => from.get(id)?.homeDepartmentId ?? ''),
          }),
        );
      }

      await this.writeCell(ctx, snapshot, input, mainIds, coIds);
      return this.load(tx, cohortId);
    });
  }

  /** Sets (or clears) a course's subject mentor for the cohort. */
  setMentor(tenant: Tenant, cohortId: string, input: SubjectMentorInput): Promise<TeachingGridDto> {
    return this.run(tenant, async (ctx) => {
      const { tx } = ctx;
      const { cohort, snapshot } = await this.cohortAndSnapshot(tx, cohortId);
      const course = coursesForCohort(cohort, snapshot.courses).find(
        (c) => c.id === input.courseId,
      );
      if (!course) fieldError('courseId', `This course is not in ${cohort.displayCode}’s scheme.`);
      const termId = snapshot.term!.id;
      const existing = await tx.subjectMentor.findFirst({
        where: { termId, courseId: input.courseId, cohortId },
      });
      const current = existing && !existing.deletedAt ? existing.facultyId : null;
      if (current === input.facultyId) return this.load(tx, cohortId);

      const ids = [current, input.facultyId].filter((x): x is string => x != null);
      const faculty = await this.faculty(tx, ids);
      if (input.facultyId && !faculty.has(input.facultyId))
        fieldError('facultyId', 'Choose a teacher from the list.');
      for (const id of ids) {
        this.md.assertCan(
          tenant,
          'teaching.manage',
          this.md.resource(tenant, 'teaching_assignment', cohort.departmentId, {
            facultyDepartmentIds: [faculty.get(id)?.homeDepartmentId ?? ''],
          }),
        );
      }

      // One row per (term, course, cohort) even when archived: reuse it.
      let rowId: string;
      if (!existing) {
        const created = await tx.subjectMentor.create({
          data: {
            instituteId: tenant.institute.id,
            termId,
            courseId: input.courseId,
            cohortId,
            facultyId: input.facultyId!,
          },
        });
        rowId = created.id;
      } else {
        rowId = existing.id;
        await tx.subjectMentor.update({
          where: { id: existing.id },
          data: input.facultyId
            ? { facultyId: input.facultyId, deletedAt: null }
            : { deletedAt: new Date() },
        });
      }
      const action = !input.facultyId
        ? 'subject_mentor.archived'
        : current
          ? 'subject_mentor.updated'
          : 'subject_mentor.created';
      await this.md.audit(ctx, action, 'subject_mentor', rowId, {
        changes: { facultyId: { from: current, to: input.facultyId } },
      });
      return this.load(tx, cohortId);
    });
  }

  // ---- Helpers --------------------------------------------------------------------------

  /** Every call loads the whole term's snapshot, so it gets the longer limit. */
  private run<T>(tenant: Tenant, fn: (ctx: EntityContext) => Promise<T>): Promise<T> {
    return this.md.run(tenant, fn, undefined, SNAPSHOT_TX);
  }

  private async cohortAndSnapshot(
    tx: TxClient,
    cohortId: string,
  ): Promise<{ cohort: PlanCohort; snapshot: ReadinessSnapshot }> {
    const row = await tx.cohort.findFirst({ where: { id: cohortId, ...live } });
    if (!row)
      throw new NotFoundException('We could not find this cohort. It may have been archived.');
    const snapshot = await loadReadinessSnapshot(tx, row.termId);
    const cohort = snapshot.cohorts.find((c) => c.id === cohortId);
    if (!cohort) throw new NotFoundException('We could not find this cohort.');
    return { cohort, snapshot };
  }

  private async faculty(tx: TxClient, ids: string[]): Promise<Map<string, FacultyInfo>> {
    if (ids.length === 0) return new Map();
    const rows = await tx.faculty.findMany({
      where: { id: { in: ids }, ...live },
      select: facultySelect,
    });
    return new Map(rows.map((f) => [f.id, f]));
  }

  private async load(tx: TxClient, cohortId: string): Promise<TeachingGridDto> {
    const { cohort, snapshot } = await this.cohortAndSnapshot(tx, cohortId);
    const groups = groupsOf(snapshot);
    const host = cohort.joinsCohortId
      ? (snapshot.cohorts.find((c) => c.id === cohort.joinsCohortId) ?? null)
      : null;
    const rows = cohort.joinsCohortId ? [] : gridRows(cohort, snapshot, groups);
    const cells = rows.flatMap((r) => r.cells);

    const courses = coursesForCohort(cohort, snapshot.courses).filter((c) => c.isScheduled);
    const mentorRows = await tx.subjectMentor.findMany({
      where: { termId: snapshot.term!.id, cohortId, ...live },
    });
    const mentorOf = new Map(mentorRows.map((m) => [m.courseId, m.facultyId]));

    const facultyRows = await tx.faculty.findMany({
      where: live,
      select: facultySelect,
      orderBy: { name: 'asc' },
    });
    const load = facultyLoad(snapshot.assignments, new Map(snapshot.courses.map((c) => [c.id, c])));
    const faculty: TeachingFacultyDto[] = facultyRows.map((f) => {
      const assigned = load.get(f.id) ?? 0;
      const max = f.maxPeriodsPerWeek;
      return {
        id: f.id,
        name: f.name,
        shortCode: f.shortCode,
        departmentId: f.homeDepartmentId,
        departmentCode: f.homeDepartment.code,
        assigned,
        max,
        // Same rule as the readiness check's load table.
        status: assigned > max ? 'over' : assigned < max / 2 ? 'under' : 'ok',
      };
    });

    return {
      termId: snapshot.term!.id,
      cohort: {
        id: cohort.id,
        displayCode: cohort.displayCode,
        semester: cohort.semester,
        departmentId: cohort.departmentId,
        joinsCohortId: host?.id ?? null,
        joinsDisplayCode: host?.displayCode ?? null,
      },
      rows,
      mentors: courses.map((c) => ({
        courseId: c.id,
        courseCode: c.code,
        courseTitle: c.title,
        facultyId: mentorOf.get(c.id) ?? null,
      })),
      faculty,
      cells: cells.length,
      missing: cells.filter((c) => !c.facultyId).length,
    };
  }

  private async writeCell(
    ctx: EntityContext,
    snapshot: ReadinessSnapshot,
    input: TeachingCellInput,
    mainIds: string[],
    coIds: string[],
  ): Promise<void> {
    const { tx, tenant } = ctx;
    const key = assignmentKey(input.courseId, input.component, input.target, input.targetId);
    const found = snapshot.assignments.find((a) => keyOfAssignment(a) === key) ?? null;
    const before = found ? teachersOf(found) : { main: [], co: [] };
    const after = { main: mainIds, co: coIds };
    if (JSON.stringify(before) === JSON.stringify(after)) return;

    if (mainIds.length + coIds.length === 0) {
      // Clearing a cell archives the assignment (restorable from the audit log's id).
      await tx.teachingAssignment.update({
        where: { id: found!.id },
        data: { deletedAt: new Date() },
      });
      await this.md.audit(ctx, 'teaching_assignment.archived', 'teaching_assignment', found!.id, {
        before,
      });
      return;
    }

    let id = found?.id;
    if (!id) {
      const created = await tx.teachingAssignment.create({
        data: {
          instituteId: tenant.institute.id,
          termId: snapshot.term!.id,
          courseId: input.courseId,
          component: input.component,
          target: input.target,
          sectionId: input.target === 'section' ? input.targetId : null,
          subGroupId: input.target === 'subgroup' ? input.targetId : null,
          electiveSectionId: input.target === 'elective_section' ? input.targetId : null,
        },
      });
      id = created.id;
    } else {
      await tx.teachingAssignmentFaculty.deleteMany({ where: { assignmentId: id } });
    }
    await tx.teachingAssignmentFaculty.createMany({
      data: [
        ...mainIds.map((facultyId) => ({ facultyId, role: 'main' as const })),
        ...coIds.map((facultyId) => ({ facultyId, role: 'co_teacher' as const })),
      ].map((f) => ({ ...f, instituteId: tenant.institute.id, assignmentId: id! })),
    });
    await this.md.audit(
      ctx,
      found ? 'teaching_assignment.updated' : 'teaching_assignment.created',
      'teaching_assignment',
      id,
      found
        ? { changes: { faculty: { from: before, to: after } } }
        : { after: { ...input, ...after } },
    );
  }
}

const facultySelect = {
  id: true,
  name: true,
  shortCode: true,
  maxPeriodsPerWeek: true,
  homeDepartmentId: true,
  homeDepartment: { select: { code: true } },
} as const;

function groupsOf(snapshot: ReadinessSnapshot): GroupIndex {
  return new GroupIndex(snapshot.sections, snapshot.subGroups, snapshot.electiveSections);
}

function teachersOf(a: PlanAssignment): { main: string[]; co: string[] } {
  return {
    main: a.faculty
      .filter((f) => f.role === 'main')
      .map((f) => f.facultyId)
      .sort(),
    co: a.faculty
      .filter((f) => f.role !== 'main')
      .map((f) => f.facultyId)
      .sort(),
  };
}

/** The grid of a cohort with its own sections: one row per scheduled course part. */
function gridRows(
  cohort: PlanCohort,
  snapshot: ReadinessSnapshot,
  groups: GroupIndex,
): TeachingRowDto[] {
  const sections = groups.sections(cohort.id);
  const byKey = new Map(snapshot.assignments.map((a) => [keyOfAssignment(a), a]));
  const rows: TeachingRowDto[] = [];
  for (const course of coursesForCohort(cohort, snapshot.courses)) {
    if (!course.isScheduled) continue;
    for (const component of activeComponents(course)) {
      const cells: TeachingCellDto[] = requiredTargets(course, component, sections, groups).map(
        (t) => {
          const a = byKey.get(assignmentKey(course.id, component, t.kind, t.id));
          const teachers = a ? teachersOf(a) : { main: [], co: [] };
          return {
            target: t.kind,
            targetId: t.id,
            targetName: t.name,
            strength: t.strength,
            facultyId: teachers.main[0] ?? null,
            coTeacherIds: teachers.co,
          };
        },
      );
      rows.push({
        courseId: course.id,
        courseCode: course.code,
        courseTitle: course.title,
        component,
        periods: componentPeriods(course, component),
        cells,
      });
    }
  }
  return rows;
}
