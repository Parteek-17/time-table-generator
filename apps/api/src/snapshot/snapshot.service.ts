import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, TxClient } from '@slotwise/db';
import { classCapacity, roomNeedFor, type Component } from '@slotwise/shared';
import { SETUP_SNAPSHOT_V1, SetupSnapshotV1 } from '@slotwise/shared/contracts';
import type { Tenant } from '../common/request-context';
import { MasterDataService } from '../masterdata/masterdata.service';

const live = { deletedAt: null };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const isoOrNull = (d: Date | null) => (d ? iso(d) : null);
/** Byte order: the same result whatever the database collation is. */
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

interface ScopedDb {
  scopeType: SetupSnapshotV1['holidays'][number]['scopeType'];
  departmentId: string | null;
  programmeId: string | null;
  cohortId: string | null;
  sectionId: string | null;
}
const scopeOf = (r: ScopedDb) => ({
  scopeType: r.scopeType,
  departmentId: r.departmentId,
  programmeId: r.programmeId,
  cohortId: r.cohortId,
  sectionId: r.sectionId,
});

/**
 * Builds `setup-snapshot.v1` for one term (ADR 0010): the same rows as the readiness check
 * (packages/db/src/readiness-snapshot.ts) plus everything the solver needs. Runs in a tenant
 * transaction, so row-level security keeps it to the caller's institute; archived rows are
 * left out, and references to them (an archived teacher on an assignment) are dropped.
 */
@Injectable()
export class SnapshotService {
  constructor(private readonly md: MasterDataService) {}

  build(tenant: Tenant, termId: string, scopeId?: string): Promise<SetupSnapshotV1> {
    return this.md.run(tenant, async ({ tx }) => {
      const term = await tx.term.findFirst({ where: { id: termId, ...live } });
      if (!term) throw new NotFoundException('We could not find this term.');
      const scope = scopeId ? await this.scope(tx, termId, scopeId) : null;
      const data = await load(tx, term, scope?.cohortIds ?? null);
      return SetupSnapshotV1.parse({
        version: SETUP_SNAPSHOT_V1,
        generatedAt: new Date().toISOString(),
        instituteId: tenant.institute.id,
        timezone: tenant.institute.timezone,
        term: {
          id: term.id,
          label: term.label,
          kind: term.kind,
          status: term.status,
          startDate: iso(term.startDate),
          endDate: iso(term.endDate),
          minTeachingDays: term.minTeachingDays,
        },
        scope,
        ...data,
      });
    });
  }

  private async scope(
    tx: TxClient,
    termId: string,
    scopeId: string,
  ): Promise<{ id: string; name: string; cohortIds: string[] }> {
    const scope = await tx.timetableScope.findFirst({
      where: { id: scopeId, termId, ...live },
      include: { cohorts: { where: { cohort: live } } },
    });
    if (!scope) throw new NotFoundException('We could not find this timetable scope in this term.');
    return {
      id: scope.id,
      name: scope.name,
      cohortIds: scope.cohorts.map((c) => c.cohortId).sort(byText),
    };
  }
}

type TermRow = Prisma.TermGetPayload<object>;

/** Everything except version, institute, term and scope. `cohortIds` null = every cohort. */
async function load(tx: TxClient, term: TermRow, cohortIds: readonly string[] | null) {
  const termId = term.id;
  const [cohorts, bells, holidays, windows, extraDays, cohortWindows] = await Promise.all([
    tx.cohort.findMany({
      where: { termId, ...live, ...(cohortIds ? { id: { in: [...cohortIds] } } : {}) },
      include: { batch: { include: { branch: true } } },
    }),
    tx.bellSchedule.findMany({
      where: live,
      include: { periods: true, breaks: true, programmes: true },
    }),
    tx.holiday.findMany({
      where: { ...live, endDate: { gte: term.startDate }, startDate: { lte: term.endDate } },
    }),
    tx.calendarWindow.findMany({ where: { termId, ...live } }),
    tx.extraWorkingDay.findMany({ where: { termId, ...live } }),
    tx.termCohortWindow.findMany({ where: { termId, ...live } }),
  ]);
  const ids = cohorts.map((c) => c.id);
  const [sections, electives, assignments, faculty, rooms, fixedSlots] = await Promise.all([
    tx.section.findMany({
      where: { cohortId: { in: ids }, ...live },
      include: { subGroups: { where: live } },
    }),
    tx.electiveSection.findMany({ where: { termId, ...live }, include: { sources: true } }),
    tx.teachingAssignment.findMany({ where: { termId, ...live }, include: { faculty: true } }),
    tx.faculty.findMany({ where: live, include: { unavailability: true } }),
    tx.room.findMany({ where: live, include: { building: true } }),
    tx.fixedSlot.findMany({ where: { termId, ...live }, include: { faculty: true } }),
  ]);
  const schemeIds = [...new Set(cohorts.map((c) => c.batch.schemeVersionId))];
  const courses = await tx.course.findMany({
    where: { schemeVersionId: { in: schemeIds }, ...live },
    include: { branches: true },
  });

  // Only what the included cohorts can reach, so ids in the snapshot always resolve.
  const sectionIds = new Set(sections.map((s) => s.id));
  const subGroupIds = new Set(sections.flatMap((s) => s.subGroups.map((g) => g.id)));
  const keptElectives = electives
    .map((e) => ({ ...e, sources: e.sources.filter((s) => sectionIds.has(s.sectionId)) }))
    .filter((e) => e.sources.length > 0);
  const electiveIds = new Set(keptElectives.map((e) => e.id));
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const facultyIds = new Set(faculty.map((f) => f.id));
  const keptAssignments = assignments.filter(
    (a) =>
      courseById.has(a.courseId) &&
      (a.sectionId
        ? sectionIds.has(a.sectionId)
        : a.subGroupId
          ? subGroupIds.has(a.subGroupId)
          : a.electiveSectionId != null && electiveIds.has(a.electiveSectionId)),
  );

  const periods = (courseId: string, component: Component): number => {
    const c = courseById.get(courseId)!;
    if (!c.isScheduled) return 0;
    return component === 'lecture'
      ? c.lectures
      : component === 'tutorial'
        ? c.tutorials
        : c.practicals;
  };

  return {
    bellSchedules: bells
      .sort((a, b) => byText(a.name, b.name))
      .map((b) => ({
        id: b.id,
        name: b.name,
        isDefault: b.isDefault,
        workingDays: [...b.workingDays].sort((x, y) => x - y),
        periods: b.periods
          .sort((x, y) => x.index - y.index)
          .map((p) => ({
            index: p.index,
            label: p.label,
            startMinute: p.startMinute,
            endMinute: p.endMinute,
          })),
        breaks: b.breaks
          .sort((x, y) => x.afterPeriodIndex - y.afterPeriodIndex)
          .map((x) => ({
            label: x.label,
            afterPeriodIndex: x.afterPeriodIndex,
            minutes: x.minutes,
          })),
        overrides: b.programmes.map((o) => ({
          programmeId: o.programmeId,
          semesters: o.semesters,
        })),
      })),
    holidays: holidays
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
      .map((h) => ({
        ...scopeOf(h),
        id: h.id,
        name: h.name,
        startDate: iso(h.startDate),
        endDate: iso(h.endDate),
      })),
    calendarWindows: windows
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
      .map((w) => ({
        ...scopeOf(w),
        id: w.id,
        type: w.type,
        label: w.label,
        startDate: iso(w.startDate),
        endDate: iso(w.endDate),
      })),
    extraWorkingDays: extraDays
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((d) => ({
        ...scopeOf(d),
        id: d.id,
        date: iso(d.date),
        followsWeekday: d.followsWeekday,
      })),
    cohortWindows: cohortWindows
      .sort((a, b) => a.teachingStart.getTime() - b.teachingStart.getTime() || byText(a.id, b.id))
      .map((w) => ({
        id: w.id,
        programmeId: w.programmeId,
        semesters: w.semesters,
        entryType: w.entryType,
        teachingStart: iso(w.teachingStart),
        prepHolidaysStart: isoOrNull(w.prepHolidaysStart),
        endSemExamStart: isoOrNull(w.endSemExamStart),
      })),
    cohorts: cohorts
      .sort((a, b) => a.semester - b.semester || byText(a.displayCode, b.displayCode))
      .map((c) => ({
        id: c.id,
        displayCode: c.displayCode,
        semester: c.semester,
        isRunning: c.isRunning,
        entryType: c.batch.entryType,
        schemeVersionId: c.batch.schemeVersionId,
        programmeId: c.batch.programmeId,
        branchId: c.batch.branchId,
        departmentId: c.batch.branch.departmentId,
        // A host cohort outside the scope is still named, so the joining cohort is explained.
        joinsCohortId: c.joinsCohortId,
      })),
    sections: sections
      .sort((a, b) => byText(a.displayName, b.displayName) || byText(a.id, b.id))
      .map((s) => ({
        id: s.id,
        cohortId: s.cohortId,
        name: s.name,
        displayName: s.displayName,
        strength: s.strength,
        homeRoomId: s.homeRoomId,
      })),
    subGroups: sections.flatMap((s) =>
      s.subGroups
        .sort((a, b) => byText(a.name, b.name))
        .map((g) => ({ id: g.id, sectionId: g.sectionId, name: g.name, strength: g.strength })),
    ),
    electiveSections: keptElectives
      .sort((a, b) => byText(a.name, b.name))
      .map((e) => ({
        id: e.id,
        courseId: e.courseId,
        name: e.name,
        strength: e.strength,
        sourceSectionIds: e.sources.map((x) => x.sectionId).sort(byText),
      })),
    courses: courses
      .sort((a, b) => a.semester - b.semester || byText(a.code, b.code))
      .map((c) => {
        const roomNeeds: Partial<Record<Component, ReturnType<typeof roomNeedFor>>> = {};
        if (c.isScheduled) {
          if (c.lectures > 0) roomNeeds.lecture = roomNeedFor(c, 'lecture');
          if (c.tutorials > 0) roomNeeds.tutorial = roomNeedFor(c, 'tutorial');
          if (c.practicals > 0) roomNeeds.practical = roomNeedFor(c, 'practical');
        }
        return {
          id: c.id,
          code: c.code,
          title: c.title,
          shortName: c.shortName,
          schemeVersionId: c.schemeVersionId,
          semester: c.semester,
          branchIds: c.branches.map((b) => b.branchId).sort(byText),
          offeringDepartmentId: c.offeringDepartmentId,
          type: c.type,
          electiveGroup: c.electiveGroup,
          lectures: c.lectures,
          tutorials: c.tutorials,
          practicals: c.practicals,
          syllabusHours: c.syllabusHours,
          labBlockLength: c.labBlockLength,
          isScheduled: c.isScheduled,
          tutorialBy: c.tutorialBy,
          practicalBy: c.practicalBy,
          roomNeeds,
        };
      }),
    assignments: keptAssignments
      .sort(
        (a, b) =>
          byText(a.courseId, b.courseId) || byText(a.component, b.component) || byText(a.id, b.id),
      )
      .map((a) => ({
        id: a.id,
        courseId: a.courseId,
        component: a.component,
        target: a.target,
        sectionId: a.sectionId,
        subGroupId: a.subGroupId,
        electiveSectionId: a.electiveSectionId,
        preferredRoomId: a.preferredRoomId,
        preferredLabCategory: a.preferredLabCategory,
        periodsPerWeek: periods(a.courseId, a.component),
        faculty: a.faculty
          .filter((f) => facultyIds.has(f.facultyId))
          .map((f) => ({ facultyId: f.facultyId, role: f.role })),
      })),
    faculty: faculty
      .sort((a, b) => byText(a.shortCode, b.shortCode))
      .map((f) => ({
        id: f.id,
        name: f.name,
        shortCode: f.shortCode,
        homeDepartmentId: f.homeDepartmentId,
        designation: f.designation,
        experience: f.experience,
        maxPeriodsPerDay: f.maxPeriodsPerDay,
        maxPeriodsPerWeek: f.maxPeriodsPerWeek,
        unavailable: f.unavailability
          .map((u) => ({ weekday: u.weekday, periodIndex: u.periodIndex }))
          .sort((x, y) => x.weekday - y.weekday || x.periodIndex - y.periodIndex),
      })),
    rooms: rooms
      .sort((a, b) => byText(a.code, b.code))
      .map((r) => ({
        id: r.id,
        code: r.code,
        buildingId: r.buildingId,
        buildingName: r.building.name,
        floor: r.floor,
        type: r.type,
        labCategories: r.labCategories,
        capacity: classCapacity(r),
        rows: r.rows,
        seatsPerRow: r.seatsPerRow,
        examSeatsPerBench: r.examSeatsPerBench,
        ownerDepartmentId: r.ownerDepartmentId,
        isShared: r.isShared,
        isAccessible: r.isAccessible,
      })),
    fixedSlots: fixedSlots
      .sort(
        (a, b) =>
          a.weekday - b.weekday || a.startPeriodIndex - b.startPeriodIndex || byText(a.id, b.id),
      )
      .map((s) => ({
        ...scopeOf(s),
        id: s.id,
        kind: s.kind,
        label: s.label,
        weekday: s.weekday,
        startPeriodIndex: s.startPeriodIndex,
        endPeriodIndex: s.endPeriodIndex,
        facultyIds: s.faculty
          .map((f) => f.facultyId)
          .filter((id) => facultyIds.has(id))
          .sort(byText),
      })),
  };
}
