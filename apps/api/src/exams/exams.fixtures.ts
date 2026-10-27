/**
 * Test data for P6's e2e tests, written with the owner role: one term, a scheme with three
 * courses, two sections with students, and rooms. Fictional (CLAUDE.md).
 */
import type { PrismaClient } from '@slotwise/db';

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
  const [cs301, cs303, ma301] = courses as [
    (typeof courses)[0],
    (typeof courses)[0],
    (typeof courses)[0],
  ];
  return { term, courses: { cs301, cs303, ma301 }, sections: { a, b } };
}

/** P6's rows go before purgeInstitute(), which does not know them yet (INT request). */
export async function purgeExams(owner: PrismaClient, instituteId: string): Promise<void> {
  await owner.$executeRaw`DELETE FROM seating_plans WHERE institute_id = ${instituteId}::uuid`;
  await owner.examSeatNeed.deleteMany({ where: { instituteId } });
  await owner.examPaper.deleteMany({ where: { instituteId } });
  await owner.examSession.deleteMany({ where: { instituteId } });
  await owner.exam.deleteMany({ where: { instituteId } });
}
