/**
 * Test data for P6's e2e tests, written with the owner role: one term, a scheme with three
 * courses, two sections with students (5 + 4 active), three rooms and four teachers. Fictional (CLAUDE.md).
 */
import type { PrismaClient } from '@slotwise/db';
import type { SolverSeatingRequestV1, SolverSeatingResponseV1 } from '@slotwise/shared/contracts';

export async function examWorld(owner: PrismaClient, instituteId: string, departmentId: string) {
  const programme = await owner.programme.create({
    data: { instituteId, code: 'BT', name: 'B.Tech', level: 'ug', totalSemesters: 8 },
  });
  const branch = await owner.branch.create({
    data: { instituteId, programmeId: programme.id, code: 'CSE', name: 'CSE', departmentId },
  });
  const scheme = await owner.schemeVersion.create({
    data: { instituteId, programmeId: programme.id, name: '2024' },
  });
  const courses = await Promise.all(
    ['CS301', 'CS303', 'MA301'].map((code) =>
      owner.course.create({
        data: {
          instituteId,
          schemeVersionId: scheme.id,
          semester: 5,
          code,
          title: `Course ${code}`,
          shortName: code,
          lectures: 3,
          offeringDepartmentId: departmentId,
        },
      }),
    ),
  );
  const session = await owner.academicSession.create({
    data: { instituteId, name: '2026-27', startYear: 2026 },
  });
  const term = await owner.term.create({
    data: {
      instituteId,
      sessionId: session.id,
      kind: 'odd',
      label: 'July–Dec 2026',
      startDate: new Date('2026-07-15T00:00:00Z'),
      endDate: new Date('2026-12-20T00:00:00Z'),
    },
  });
  const batch = await owner.batch.create({
    data: {
      instituteId,
      programmeId: programme.id,
      branchId: branch.id,
      admissionYear: 2024,
      schemeVersionId: scheme.id,
    },
  });
  const cohort = await owner.cohort.create({
    data: { instituteId, batchId: batch.id, termId: term.id, semester: 5, displayCode: 'CSE 5' },
  });
  const sections = await Promise.all(
    ['A', 'B'].map((name) =>
      owner.section.create({
        data: { instituteId, cohortId: cohort.id, name, displayName: `CS ${name}`, strength: 6 },
      }),
    ),
  );
  const [a, b] = sections as [(typeof sections)[0], (typeof sections)[0]];
  // 6 students in CS A (one left the college), 4 in CS B.
  await owner.student.createMany({
    data: [
      ...[1, 2, 3, 4, 5, 6].map((n) => ({
        instituteId,
        batchId: batch.id,
        classRollNo: `24A${n}`,
        name: `Student A${n}`,
        sectionId: a.id,
        status: n === 6 ? ('left' as const) : ('active' as const),
      })),
      ...[1, 2, 3, 4].map((n) => ({
        instituteId,
        batchId: batch.id,
        classRollNo: `24B${n}`,
        name: `Student B${n}`,
        sectionId: b.id,
      })),
    ],
  });
  const building = await owner.building.create({
    data: { instituteId, name: 'Exam Block', floors: 2 },
  });
  const room = (code: string, floor: number, examSeatsPerBench: number | null) =>
    owner.room.create({
      data: {
        instituteId,
        buildingId: building.id,
        code,
        floor,
        type: 'lecture',
        rows: 3,
        seatsPerRow: 4,
        examSeatsPerBench,
        isAccessible: floor === 0,
      },
    });
  // 3 rows × 2 benches × 1 seat = 6 exam seats each; the lab has none.
  const rooms = {
    f1: await room('F1', 1, 1),
    g1: await room('G1', 0, 1),
    lab: await room('LAB', 0, null),
  };
  // Four teachers; Dr. Anand teaches CS301 to CS A this term.
  const teacher = (code: string, name: string) =>
    owner.faculty.create({
      data: {
        instituteId,
        employeeCode: code,
        name,
        shortCode: code,
        designation: 'assistant_professor',
        experience: 'experienced',
        homeDepartmentId: departmentId,
        maxPeriodsPerDay: 5,
        maxPeriodsPerWeek: 18,
      },
    });
  const faculty = {
    anand: await teacher('FA', 'Dr. Anand'),
    bedi: await teacher('FB', 'Ms. Bedi'),
    chopra: await teacher('FC', 'Mr. Chopra'),
    dutt: await teacher('FD', 'Ms. Dutt'),
  };
  const assignment = await owner.teachingAssignment.create({
    data: {
      instituteId,
      termId: term.id,
      courseId: courses[0]!.id,
      component: 'lecture',
      target: 'section',
      sectionId: a.id,
    },
  });
  await owner.teachingAssignmentFaculty.create({
    data: { instituteId, assignmentId: assignment.id, facultyId: faculty.anand.id },
  });
  const [cs301, cs303, ma301] = courses as [
    (typeof courses)[0],
    (typeof courses)[0],
    (typeof courses)[0],
  ];
  return { term, courses: { cs301, cs303, ma301 }, sections: { a, b }, rooms, faculty };
}

/** P6's rows go before purgeInstitute(), which does not know them yet (INT request). */
export async function purgeExams(owner: PrismaClient, instituteId: string): Promise<void> {
  await owner.$executeRaw`DELETE FROM seating_plans WHERE institute_id = ${instituteId}::uuid`;
  await owner.examSeatNeed.deleteMany({ where: { instituteId } });
  await owner.invigilatorUnavailability.deleteMany({ where: { instituteId } });
  await owner.examPaper.deleteMany({ where: { instituteId } });
  await owner.examSession.deleteMany({ where: { instituteId } });
  await owner.exam.deleteMany({ where: { instituteId } });
}

/**
 * Stand-in for the solver in API tests: seats everyone in hall order, front row first, and gives
 * each used hall the least-loaded available teacher who does not teach a paper in it. The real
 * rules are tested in services/solver/tests/seating.
 */
export function fakeSolve(req: SolverSeatingRequestV1): SolverSeatingResponseV1 {
  const halls = [...req.halls].sort((x, y) => x.order - y.order);
  const students = [...req.students].sort((x, y) => x.rollNo.localeCompare(y.rollNo));
  const seats: SolverSeatingResponseV1['seats'] = [];
  for (const hall of halls) {
    const columns = hall.benchesPerRow * hall.seatsPerBench;
    for (let i = 0; i < hall.rows * columns && students.length > 0; i++) {
      const s = students.shift()!;
      const row = Math.floor(i / columns) + 1;
      const column = (i % columns) + 1;
      seats.push({
        studentId: s.id,
        paperId: s.paperId,
        hallId: hall.id,
        row,
        column,
        label: `${hall.code}-R${row}-C${column}`,
      });
    }
  }
  const pool = req.faculty
    .filter((f) => f.available)
    .sort((x, y) => x.dutiesSoFar - y.dutiesSoFar || x.name.localeCompare(y.name));
  const used = new Set<string>();
  return {
    version: 'solver-seating.v1',
    requestId: req.requestId,
    status: students.length ? 'INFEASIBLE' : 'FEASIBLE',
    solveSeconds: 0.01,
    seats,
    unseated: students.map((s) => ({
      studentId: s.id,
      reason: 'not_enough_seats' as const,
      message: `${s.rollNo} has no seat: the halls are full.`,
    })),
    halls: halls.map((h) => {
      const mine = seats.filter((s) => s.hallId === h.id);
      const papers = new Set(mine.map((s) => s.paperId));
      const invigilator = mine.length
        ? pool.find((f) => !used.has(f.id) && !f.teachesPaperIds.some((p) => papers.has(p)))
        : undefined;
      if (invigilator) used.add(invigilator.id);
      return {
        hallId: h.id,
        capacity: h.rows * h.benchesPerRow * h.seatsPerBench,
        used: mine.length,
        reserved: req.options.reserveSeatsPerHall,
        paperIds: [...new Set(mine.map((s) => s.paperId))],
        invigilatorIds: invigilator ? [invigilator.id] : [],
      };
    }),
    invigilationProblems: [],
  };
}
