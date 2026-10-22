/**
 * Loads one term's master data in the shape readiness() in packages/shared expects.
 * Runs inside a tenant transaction (withTenant), so row-level security limits it to the
 * current institute; archived rows (deleted_at) are left out.
 */
import type { Prisma } from '@prisma/client';
import type { ReadinessSnapshot } from '@slotwise/shared';

type Tx = Prisma.TransactionClient;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const live = { deletedAt: null };

export async function loadReadinessSnapshot(
  tx: Tx,
  termId: string,
  options: {
    /** Limit to these cohorts (a timetable scope). Default: every cohort of the term. */
    cohortIds?: readonly string[];
  } = {},
): Promise<ReadinessSnapshot> {
  const term = await tx.term.findFirst({ where: { id: termId, ...live } });
  const activeTerm = await tx.term.findFirst({
    where: { status: 'active', ...live },
    select: { id: true },
  });

  const cohortRows = await tx.cohort.findMany({
    where: {
      termId,
      ...live,
      ...(options.cohortIds ? { id: { in: [...options.cohortIds] } } : {}),
    },
    include: { batch: { include: { branch: true } } },
    orderBy: [{ semester: 'asc' }, { displayCode: 'asc' }],
  });
  const cohortIds = cohortRows.map((c) => c.id);

  const [sectionRows, electiveRows, bellRows, assignmentRows, facultyRows, roomRows] =
    await Promise.all([
      tx.section.findMany({
        where: { cohortId: { in: cohortIds }, ...live },
        include: { subGroups: { where: live, orderBy: { name: 'asc' } } },
        orderBy: { name: 'asc' },
      }),
      tx.electiveSection.findMany({ where: { termId, ...live }, include: { sources: true } }),
      tx.bellSchedule.findMany({
        where: live,
        include: { periods: true, breaks: true, programmes: true },
      }),
      tx.teachingAssignment.findMany({ where: { termId, ...live }, include: { faculty: true } }),
      tx.faculty.findMany({
        where: live,
        include: { _count: { select: { unavailability: true } } },
        orderBy: { name: 'asc' },
      }),
      tx.room.findMany({ where: live, orderBy: { code: 'asc' } }),
    ]);

  const schemeIds = [...new Set(cohortRows.map((c) => c.batch.schemeVersionId))];
  const courseRows = await tx.course.findMany({
    where: { schemeVersionId: { in: schemeIds }, ...live },
    include: { branches: true },
    orderBy: [{ semester: 'asc' }, { code: 'asc' }],
  });

  const [fixedSlots, windows, holidays, calendarWindows, extraDays] = await Promise.all([
    tx.fixedSlot.findMany({ where: { termId, ...live } }),
    tx.termCohortWindow.findMany({ where: { termId, ...live } }),
    term
      ? tx.holiday.findMany({
          where: { ...live, endDate: { gte: term.startDate }, startDate: { lte: term.endDate } },
        })
      : Promise.resolve([]),
    tx.calendarWindow.findMany({ where: { termId, ...live } }),
    tx.extraWorkingDay.findMany({ where: { termId, ...live } }),
  ]);

  const scoped = <T extends { scopeType: ReadinessSnapshot['holidays'][number]['scopeType'] }>(
    row: T & {
      departmentId: string | null;
      programmeId: string | null;
      cohortId: string | null;
      sectionId: string | null;
    },
  ) => ({
    scopeType: row.scopeType,
    departmentId: row.departmentId,
    programmeId: row.programmeId,
    cohortId: row.cohortId,
    sectionId: row.sectionId,
  });

  return {
    term: term
      ? {
          id: term.id,
          label: term.label,
          status: term.status,
          startDate: iso(term.startDate),
          endDate: iso(term.endDate),
          minTeachingDays: term.minTeachingDays,
        }
      : null,
    hasActiveTerm: activeTerm != null,
    bellSchedules: bellRows.map((b) => ({
      id: b.id,
      name: b.name,
      isDefault: b.isDefault,
      workingDays: b.workingDays,
      periods: b.periods
        .sort((x, y) => x.index - y.index)
        .map((p) => ({
          index: p.index,
          label: p.label,
          startMinute: p.startMinute,
          endMinute: p.endMinute,
        })),
      breaks: b.breaks.map((x) => ({
        label: x.label,
        afterPeriodIndex: x.afterPeriodIndex,
        minutes: x.minutes,
      })),
      overrides: b.programmes.map((o) => ({ programmeId: o.programmeId, semesters: o.semesters })),
    })),
    cohorts: cohortRows.map((c) => ({
      id: c.id,
      displayCode: c.displayCode,
      semester: c.semester,
      isRunning: c.isRunning,
      entryType: c.batch.entryType,
      schemeVersionId: c.batch.schemeVersionId,
      programmeId: c.batch.programmeId,
      branchId: c.batch.branchId,
      departmentId: c.batch.branch.departmentId,
      joinsCohortId: c.joinsCohortId,
    })),
    sections: sectionRows.map((s) => ({
      id: s.id,
      cohortId: s.cohortId,
      name: s.name,
      displayName: s.displayName,
      strength: s.strength,
    })),
    subGroups: sectionRows.flatMap((s) =>
      s.subGroups.map((g) => ({
        id: g.id,
        sectionId: g.sectionId,
        name: g.name,
        strength: g.strength,
      })),
    ),
    electiveSections: electiveRows.map((e) => ({
      id: e.id,
      courseId: e.courseId,
      name: e.name,
      strength: e.strength,
      sourceSectionIds: e.sources.map((s) => s.sectionId),
    })),
    courses: courseRows.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      shortName: c.shortName,
      schemeVersionId: c.schemeVersionId,
      semester: c.semester,
      branchIds: c.branches.map((b) => b.branchId),
      type: c.type,
      electiveGroup: c.electiveGroup,
      roomType: c.roomType,
      labCategory: c.labCategory,
      labBlockLength: c.labBlockLength,
      isScheduled: c.isScheduled,
      tutorialBy: c.tutorialBy,
      practicalBy: c.practicalBy,
      lectures: c.lectures,
      tutorials: c.tutorials,
      practicals: c.practicals,
    })),
    assignments: assignmentRows.map((a) => ({
      id: a.id,
      courseId: a.courseId,
      component: a.component,
      target: a.target,
      sectionId: a.sectionId,
      subGroupId: a.subGroupId,
      electiveSectionId: a.electiveSectionId,
      faculty: a.faculty.map((f) => ({ facultyId: f.facultyId, role: f.role })),
    })),
    faculty: facultyRows.map((f) => ({
      id: f.id,
      name: f.name,
      shortCode: f.shortCode,
      maxPeriodsPerWeek: f.maxPeriodsPerWeek,
      unavailableCells: f._count.unavailability,
    })),
    rooms: roomRows.map((r) => ({
      id: r.id,
      code: r.code,
      type: r.type,
      labCategories: r.labCategories,
      rows: r.rows,
      seatsPerRow: r.seatsPerRow,
      capacityOverride: r.capacityOverride,
    })),
    fixedSlots: fixedSlots.map((s) => ({
      ...scoped(s),
      weekday: s.weekday,
      startPeriodIndex: s.startPeriodIndex,
      endPeriodIndex: s.endPeriodIndex,
    })),
    cohortWindows: windows.map((w) => ({
      id: w.id,
      programmeId: w.programmeId,
      semesters: w.semesters,
      entryType: w.entryType,
      teachingStart: iso(w.teachingStart),
      prepHolidaysStart: w.prepHolidaysStart ? iso(w.prepHolidaysStart) : null,
      endSemExamStart: w.endSemExamStart ? iso(w.endSemExamStart) : null,
    })),
    holidays: holidays.map((h) => ({
      ...scoped(h),
      startDate: iso(h.startDate),
      endDate: iso(h.endDate),
    })),
    calendarWindows: calendarWindows.map((w) => ({
      ...scoped(w),
      startDate: iso(w.startDate),
      endDate: iso(w.endDate),
    })),
    extraWorkingDays: extraDays.map((d) => ({ ...scoped(d), date: iso(d.date) })),
  };
}
