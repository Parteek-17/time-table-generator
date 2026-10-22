/**
 * Writes the sample institute's master data (./data.ts) into an institute.
 *
 * Runs inside the caller's transaction and only touches tenant tables of that institute,
 * so it works both for the seed (owner role) and for "Try with sample data" (app role with
 * row-level security set to the new institute). Expects an institute without master data;
 * departments that already exist (Phase 0 seed) are updated in place.
 */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  activeComponents,
  buildBellSchedule,
  componentPeriods,
  coursesForCohort,
  defaultCohortCode,
  defaultLoad,
  GroupIndex,
  requiredTargets,
  sectionNames,
  semesterFor,
  splitEvenly,
  subGroupNames,
  type Component,
  type PlanCohort,
  type PlanCourse,
  type PlanElectiveSection,
  type PlanSection,
  type PlanSubGroup,
} from '@slotwise/shared';
import {
  BATCHES,
  BELL,
  BUILDINGS,
  COHORT_WINDOWS,
  COURSES,
  DEPARTMENTS,
  ELECTIVE_SECTIONS,
  EXTRA_WORKING_DAYS,
  FACULTY,
  FIXED_SLOTS,
  HOLIDAYS,
  LAB_TAS,
  MID_SEM_WINDOWS,
  PLANNED_GAPS,
  PROGRAMMES,
  ROOMS,
  SESSION,
  TERM,
  type DeptCode,
} from './data';

type Tx = Prisma.TransactionClient;

const date = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export interface SampleSummary {
  termId: string;
  departments: number;
  programmes: number;
  courses: number;
  cohorts: number;
  sections: number;
  faculty: number;
  rooms: number;
  teachingAssignments: number;
}

interface AssignmentRow {
  id: string;
  courseId: string;
  component: Component;
  target: 'section' | 'subgroup' | 'elective_section';
  targetId: string;
  faculty: { facultyId: string; role: 'main' | 'co_teacher' | 'ta' }[];
}

export async function buildSampleInstitute(tx: Tx, instituteId: string): Promise<SampleSummary> {
  const inst = { instituteId };

  // Organisation ------------------------------------------------------------------
  const deptIds = new Map<DeptCode, string>();
  for (const d of DEPARTMENTS) {
    const row = await tx.department.upsert({
      where: { instituteId_code: { instituteId, code: d.code } },
      update: { name: d.name, kind: d.kind },
      create: { ...inst, code: d.code, name: d.name, kind: d.kind },
    });
    deptIds.set(d.code, row.id);
  }
  const dept = (code: DeptCode) => deptIds.get(code)!;

  const programmeIds = new Map<string, string>();
  const branchIds = new Map<string, string>(); // "BTECH|CSE"
  const schemeIds = new Map<string, string>(); // "BTECH|Scheme 2024"
  for (const p of PROGRAMMES) {
    const id = randomUUID();
    programmeIds.set(p.code, id);
    await tx.programme.create({
      data: {
        id,
        ...inst,
        code: p.code,
        name: p.name,
        level: p.level,
        totalSemesters: p.totalSemesters,
        lateralEntrySemester: p.lateralEntrySemester,
        departmentId: p.department ? dept(p.department) : null,
      },
    });
    await tx.branch.createMany({
      data: p.branches.map((b) => {
        const branchId = randomUUID();
        branchIds.set(`${p.code}|${b.code}`, branchId);
        return {
          id: branchId,
          ...inst,
          programmeId: id,
          code: b.code,
          name: b.name,
          departmentId: dept(b.department),
          isDefault: b.isDefault ?? false,
        };
      }),
    });
    await tx.schemeVersion.createMany({
      data: p.schemes.map((name) => {
        const schemeId = randomUUID();
        schemeIds.set(`${p.code}|${name}`, schemeId);
        return { id: schemeId, ...inst, programmeId: id, name, status: 'active' as const };
      }),
    });
  }

  // Courses -----------------------------------------------------------------------
  const planCourses: (PlanCourse & { dept: DeptCode })[] = [];
  const courseByCode = new Map<string, PlanCourse & { dept: DeptCode }>();
  for (const [schemeKey, semesters] of Object.entries(COURSES)) {
    const programmeCode = schemeKey.split('|')[0]!;
    const schemeVersionId = schemeIds.get(schemeKey)!;
    for (const [semester, defs] of Object.entries(semesters)) {
      for (const c of defs) {
        const [lectures, tutorials, practicals] = c.ltp;
        const course = {
          id: randomUUID(),
          code: c.code,
          title: c.title,
          shortName: c.short,
          schemeVersionId,
          semester: Number(semester),
          branchIds: (c.branches ?? []).map((b) => branchIds.get(`${programmeCode}|${b}`)!),
          type: c.type ?? 'core',
          electiveGroup: c.electiveGroup ?? null,
          roomType: c.roomType ?? null,
          labCategory: c.labCategory ?? null,
          labBlockLength: 2,
          isScheduled: c.isScheduled ?? true,
          tutorialBy: c.tutorialBy ?? 'subgroup',
          practicalBy: c.practicalBy ?? 'subgroup',
          lectures,
          tutorials,
          practicals,
          dept: c.dept,
        } satisfies PlanCourse & { dept: DeptCode };
        planCourses.push(course);
        courseByCode.set(c.code, course);
      }
    }
  }
  await tx.course.createMany({
    data: planCourses.map((c) => ({
      id: c.id,
      ...inst,
      schemeVersionId: c.schemeVersionId,
      semester: c.semester,
      code: c.code,
      title: c.title,
      shortName: c.shortName,
      lectures: c.lectures,
      tutorials: c.tutorials,
      practicals: c.practicals,
      syllabusHours: (c.lectures + c.tutorials + c.practicals) * 14,
      type: c.type,
      electiveGroup: c.electiveGroup,
      offeringDepartmentId: dept(c.dept),
      roomType: c.roomType,
      labCategory: c.labCategory,
      labBlockLength: c.labBlockLength,
      isScheduled: c.isScheduled,
      tutorialBy: c.tutorialBy,
      practicalBy: c.practicalBy,
    })),
  });
  await tx.courseBranch.createMany({
    data: planCourses.flatMap((c) =>
      c.branchIds.map((branchId) => ({ ...inst, courseId: c.id, branchId })),
    ),
  });

  // Time --------------------------------------------------------------------------
  const session = await tx.academicSession.create({
    data: { ...inst, name: SESSION.name, startYear: SESSION.startYear },
  });
  const term = await tx.term.create({
    data: {
      ...inst,
      sessionId: session.id,
      kind: TERM.kind,
      label: TERM.label,
      startDate: date(TERM.startDate),
      endDate: date(TERM.endDate),
      minTeachingDays: TERM.minTeachingDays,
      status: 'active',
    },
  });
  const termId = term.id;

  const windowRows: Prisma.TermCohortWindowCreateManyInput[] = [];
  const windowOf = (w: (typeof COHORT_WINDOWS)[keyof typeof COHORT_WINDOWS]) => ({
    teachingStart: date(w.teachingStart),
    prepHolidaysStart: date(w.prepHolidaysStart),
    prepHolidaysEnd: date(w.prepHolidaysEnd),
    endSemExamStart: date(w.endSemExamStart),
  });
  for (const p of PROGRAMMES) {
    const programmeId = programmeIds.get(p.code)!;
    const seniorSemesters = Array.from({ length: p.totalSemesters }, (_, i) => i + 1).filter(
      (s) => s % 2 === 1 && s > 1,
    );
    windowRows.push({
      ...inst,
      termId,
      programmeId,
      semesters: [1],
      ...windowOf(COHORT_WINDOWS.firstYear),
    });
    windowRows.push({
      ...inst,
      termId,
      programmeId,
      semesters: seniorSemesters,
      ...windowOf(COHORT_WINDOWS.seniors),
    });
    if (p.lateralEntrySemester) {
      windowRows.push({
        ...inst,
        termId,
        programmeId,
        semesters: [p.lateralEntrySemester],
        entryType: 'lateral',
        ...windowOf(COHORT_WINDOWS.leet),
      });
    }
  }
  await tx.termCohortWindow.createMany({ data: windowRows });
  await tx.calendarWindow.createMany({
    data: MID_SEM_WINDOWS.map((w) => ({
      ...inst,
      termId,
      type: 'mid_sem_exam' as const,
      label: w.label,
      startDate: date(w.startDate),
      endDate: date(w.endDate),
    })),
  });
  await tx.holiday.createMany({
    data: HOLIDAYS.map((h) => ({
      ...inst,
      name: h.name,
      startDate: date(h.startDate),
      endDate: date(h.endDate),
    })),
  });
  await tx.extraWorkingDay.createMany({
    data: EXTRA_WORKING_DAYS.map((d) => ({
      ...inst,
      termId,
      date: date(d.date),
      followsWeekday: d.followsWeekday,
    })),
  });

  const bell = await tx.bellSchedule.create({
    data: { ...inst, name: BELL.name, workingDays: BELL.workingDays, isDefault: true },
  });
  await tx.bellPeriod.createMany({
    data: buildBellSchedule(BELL).map((p) => ({ ...inst, bellScheduleId: bell.id, ...p })),
  });
  await tx.bellBreak.createMany({
    data: BELL.breaks.map((b) => ({ ...inst, bellScheduleId: bell.id, ...b })),
  });
  await tx.fixedSlot.createMany({
    data: FIXED_SLOTS.map((s) => ({
      ...inst,
      termId,
      kind: s.kind,
      label: s.label,
      weekday: s.weekday,
      startPeriodIndex: s.startPeriodIndex,
      endPeriodIndex: s.endPeriodIndex,
      scopeType: 'programme' as const,
      programmeId: programmeIds.get(s.programme)!,
    })),
  });

  // Infrastructure ----------------------------------------------------------------
  const buildingIds = new Map<string, string>();
  for (const b of BUILDINGS) {
    const row = await tx.building.create({ data: { ...inst, ...b } });
    buildingIds.set(b.name, row.id);
  }
  await tx.room.createMany({
    data: ROOMS.map((r) => ({
      ...inst,
      code: r.code,
      buildingId: buildingIds.get(r.building)!,
      floor: r.floor,
      type: r.type,
      labCategories: [...(r.labCategories ?? [])],
      rows: r.rows,
      seatsPerRow: r.seatsPerRow,
      examSeatsPerBench: r.examSeatsPerBench ?? null,
      ownerDepartmentId: r.owner ? dept(r.owner) : null,
      isShared: r.type === 'lecture' || r.type === 'seminar',
      isAccessible: r.floor === 0,
    })),
  });

  // Faculty -----------------------------------------------------------------------
  const facultyByShort = new Map<
    string,
    { id: string; dept: DeptCode; max: number; isTa: boolean }
  >();
  for (const f of FACULTY) {
    const id = randomUUID();
    const load = defaultLoad(f.experience);
    facultyByShort.set(f.short, {
      id,
      dept: f.dept,
      max: load.maxPeriodsPerWeek,
      isTa: f.designation === 'teaching_assistant',
    });
    await tx.faculty.create({
      data: {
        id,
        ...inst,
        employeeCode: f.code,
        name: f.name,
        shortCode: f.short,
        email: `${f.short.toLowerCase()}@demo.slotwise.test`,
        designation: f.designation,
        experience: f.experience,
        homeDepartmentId: dept(f.dept),
        ...load,
      },
    });
  }
  await tx.facultyDepartment.createMany({
    data: FACULTY.flatMap((f) =>
      (f.alsoTeaches ?? []).map((d) => ({
        ...inst,
        facultyId: facultyByShort.get(f.short)!.id,
        departmentId: dept(d),
      })),
    ),
  });
  await tx.facultyUnavailability.createMany({
    data: FACULTY.flatMap((f) =>
      (f.unavailable ?? []).map(([weekday, periodIndex]) => ({
        ...inst,
        facultyId: facultyByShort.get(f.short)!.id,
        weekday,
        periodIndex,
      })),
    ),
  });

  // Batches, cohorts, sections ----------------------------------------------------
  const cohorts: PlanCohort[] = [];
  const sections: PlanSection[] = [];
  const subGroups: PlanSubGroup[] = [];
  const cohortByCode = new Map<string, PlanCohort>();
  const cohortByBatch = new Map<string, PlanCohort>(); // "BTECH|CSE|2025|regular"
  for (const b of BATCHES) {
    const programme = PROGRAMMES.find((p) => p.code === b.programme)!;
    const branchDef = programme.branches.find((x) => x.code === b.branch)!;
    const entryType = b.entryType ?? 'regular';
    const batchId = randomUUID();
    const schemeVersionId = schemeIds.get(`${b.programme}|${b.scheme}`)!;
    const branchId = branchIds.get(`${b.programme}|${b.branch}`)!;
    await tx.batch.create({
      data: {
        id: batchId,
        ...inst,
        programmeId: programmeIds.get(b.programme)!,
        branchId,
        admissionYear: b.admissionYear,
        entryType,
        schemeVersionId,
      },
    });
    const semester = semesterFor({ admissionYear: b.admissionYear, entryType }, programme, {
      sessionStartYear: SESSION.startYear,
      kind: TERM.kind,
    });
    if (semester == null) continue;
    const cohort: PlanCohort = {
      id: randomUUID(),
      displayCode: defaultCohortCode({
        programmeCode: programme.code,
        programmeLevel: programme.level,
        branchCode: b.branch,
        isDefaultBranch: branchDef.isDefault ?? false,
        semester,
        entryType,
      }),
      semester,
      isRunning: true,
      entryType,
      schemeVersionId,
      programmeId: programmeIds.get(b.programme)!,
      branchId,
      departmentId: dept(branchDef.department),
      joinsCohortId: b.joins
        ? cohortByBatch.get(`${b.programme}|${b.branch}|${b.joins.admissionYear}|regular`)!.id
        : null,
    };
    cohorts.push(cohort);
    cohortByCode.set(cohort.displayCode, cohort);
    cohortByBatch.set(`${b.programme}|${b.branch}|${b.admissionYear}|${entryType}`, cohort);
    await tx.cohort.create({
      data: {
        id: cohort.id,
        ...inst,
        batchId,
        termId,
        semester,
        displayCode: cohort.displayCode,
        joinsCohortId: cohort.joinsCohortId,
      },
    });

    const names = sectionNames(b.sections.length);
    b.sections.forEach((strength, i) => {
      const name = names[i]!;
      const section: PlanSection = {
        id: randomUUID(),
        cohortId: cohort.id,
        name,
        displayName: `${branchDef.sectionPrefix} ${name}`,
        strength,
      };
      sections.push(section);
      const count = b.subGroups ?? 2;
      const gap = PLANNED_GAPS.subGroupsDontAddUp;
      const strengths =
        cohort.displayCode === gap.cohort && section.displayName === gap.section
          ? [...gap.subGroups]
          : splitEvenly(strength, count);
      subGroupNames(name, count).forEach((sgName, k) =>
        subGroups.push({
          id: randomUUID(),
          sectionId: section.id,
          name: sgName,
          strength: strengths[k]!,
        }),
      );
    });
  }
  await tx.section.createMany({ data: sections.map((s) => ({ ...inst, ...s })) });
  await tx.subGroup.createMany({ data: subGroups.map((g) => ({ ...inst, ...g })) });

  const electiveSections: PlanElectiveSection[] = ELECTIVE_SECTIONS.map((e) => ({
    id: randomUUID(),
    courseId: courseByCode.get(e.course)!.id,
    name: e.name,
    strength: e.strength,
    sourceSectionIds: e.from.map((ref) => {
      const [code, sectionName] = ref.split('/');
      const cohort = cohortByCode.get(code!)!;
      return sections.find((s) => s.cohortId === cohort.id && s.name === sectionName)!.id;
    }),
  }));
  await tx.electiveSection.createMany({
    data: electiveSections.map((e) => ({
      id: e.id,
      ...inst,
      termId,
      courseId: e.courseId,
      name: e.name,
      strength: e.strength,
    })),
  });
  await tx.electiveSectionSource.createMany({
    data: electiveSections.flatMap((e) =>
      e.sourceSectionIds.map((sectionId) => ({ ...inst, electiveSectionId: e.id, sectionId })),
    ),
  });

  // Teaching assignments ----------------------------------------------------------
  const assignments = planAssignments({
    cohorts,
    sections,
    subGroups,
    electiveSections,
    courses: planCourses,
    cohortByCode,
    facultyByShort,
    courseByCode,
  });
  await tx.teachingAssignment.createMany({
    data: assignments.map((a) => ({
      id: a.id,
      ...inst,
      termId,
      courseId: a.courseId,
      component: a.component,
      target: a.target,
      sectionId: a.target === 'section' ? a.targetId : null,
      subGroupId: a.target === 'subgroup' ? a.targetId : null,
      electiveSectionId: a.target === 'elective_section' ? a.targetId : null,
    })),
  });
  await tx.teachingAssignmentFaculty.createMany({
    data: assignments.flatMap((a) => a.faculty.map((f) => ({ ...inst, assignmentId: a.id, ...f }))),
  });

  // Subject mentors for 2nd-year CSE: the teacher of section A's lectures.
  const cse3 = cohortByCode.get(LAB_TAS.cohort)!;
  const sectionA = sections.find((s) => s.cohortId === cse3.id && s.name === 'A')!;
  await tx.subjectMentor.createMany({
    data: coursesForCohort(cse3, planCourses).flatMap((c) => {
      const lecture = assignments.find(
        (a) => a.courseId === c.id && a.component === 'lecture' && a.targetId === sectionA.id,
      );
      return lecture
        ? [
            {
              ...inst,
              termId,
              courseId: c.id,
              cohortId: cse3.id,
              facultyId: lecture.faculty[0]!.facultyId,
            },
          ]
        : [];
    }),
  });

  return {
    termId,
    departments: DEPARTMENTS.length,
    programmes: PROGRAMMES.length,
    courses: planCourses.length,
    cohorts: cohorts.length,
    sections: sections.length,
    faculty: FACULTY.length,
    rooms: ROOMS.length,
    teachingAssignments: assignments.length,
  };
}

/**
 * The departments' subject distribution: who teaches what. Deterministic. A teacher keeps a
 * course across sections while they have room in their weekly limit; the next teacher of the
 * offering department with the most room takes over. Leaves PLANNED_GAPS in place.
 */
function planAssignments(args: {
  cohorts: readonly PlanCohort[];
  sections: readonly PlanSection[];
  subGroups: readonly PlanSubGroup[];
  electiveSections: readonly PlanElectiveSection[];
  courses: readonly (PlanCourse & { dept: DeptCode })[];
  cohortByCode: ReadonlyMap<string, PlanCohort>;
  facultyByShort: ReadonlyMap<string, { id: string; dept: DeptCode; max: number; isTa: boolean }>;
  courseByCode: ReadonlyMap<string, PlanCourse & { dept: DeptCode }>;
}): AssignmentRow[] {
  const groups = new GroupIndex(args.sections, args.subGroups, args.electiveSections);
  const remaining = new Map([...args.facultyByShort.values()].map((f) => [f.id, f.max]));
  const teachers = [...args.facultyByShort.values()].filter((f) => !f.isTa);
  const sticky = new Map<string, string>();
  const done = new Set<string>();
  const rows: AssignmentRow[] = [];

  const add = (
    courseId: string,
    component: Component,
    target: AssignmentRow['target'],
    targetId: string,
    facultyId: string,
    periods: number,
  ) => {
    rows.push({
      id: randomUUID(),
      courseId,
      component,
      target,
      targetId,
      faculty: [{ facultyId, role: 'main' }],
    });
    remaining.set(facultyId, remaining.get(facultyId)! - periods);
    done.add(`${courseId}|${component}|${targetId}`);
  };

  // Planned overload: one Applied Sciences teacher takes Maths-III lectures for five sections.
  const overload = PLANNED_GAPS.overloadedFaculty;
  const maths = args.courseByCode.get(overload.courseCode)!;
  const cse3 = args.cohortByCode.get(LAB_TAS.cohort)!;
  for (const name of overload.sections) {
    const section = groups.sections(cse3.id).find((s) => s.name === name)!;
    add(
      maths.id,
      'lecture',
      'section',
      section.id,
      args.facultyByShort.get(overload.shortCode)!.id,
      maths.lectures,
    );
  }

  const gap = PLANNED_GAPS.missingAssignment;
  const gapCohort = args.cohortByCode.get(gap.cohort)!;
  const gapCourse = args.courseByCode.get(gap.courseCode)!;

  for (const cohort of args.cohorts) {
    if (cohort.joinsCohortId) continue;
    const cohortSections = groups.sections(cohort.id);
    for (const course of coursesForCohort(cohort, args.courses)) {
      const offering = (course as PlanCourse & { dept: DeptCode }).dept;
      for (const component of activeComponents(course)) {
        if (cohort.id === gapCohort.id && course.id === gapCourse.id && component === gap.component)
          continue;
        const periods = componentPeriods(course, component);
        for (const t of requiredTargets(course, component, cohortSections, groups)) {
          if (done.has(`${course.id}|${component}|${t.id}`)) continue;
          const key = `${course.id}|${component}`;
          let teacher = sticky.get(key) ?? sticky.get(`${course.id}|lecture`);
          if (!teacher || remaining.get(teacher)! < periods) {
            const pick = teachers
              .filter((f) => f.dept === offering && remaining.get(f.id)! >= periods)
              .sort((a, b) => remaining.get(b.id)! - remaining.get(a.id)!)[0];
            if (!pick)
              throw new Error(
                `Sample data: no ${offering} teacher left for ${course.code} (${component})`,
              );
            teacher = pick.id;
          }
          sticky.set(key, teacher);
          add(course.id, component, t.kind, t.id, teacher, periods);
        }
      }
    }
  }

  // Lab TAs alongside the main teacher for 2nd-year CSE Data Structures labs.
  const ds = args.courseByCode.get(LAB_TAS.courseCode)!;
  rows
    .filter((r) => r.courseId === ds.id && r.component === 'practical')
    .forEach((r, i) => {
      const ta = args.facultyByShort.get(LAB_TAS.tas[i % LAB_TAS.tas.length]!)!;
      if (remaining.get(ta.id)! < ds.practicals) return;
      r.faculty.push({ facultyId: ta.id, role: 'ta' });
      remaining.set(ta.id, remaining.get(ta.id)! - ds.practicals);
    });

  return rows;
}
