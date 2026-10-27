import type { TxClient } from '@slotwise/db';
import type { SolverSeatingRequestV1 } from '@slotwise/shared/contracts';
import { hallFromRoom, shortDate } from '@slotwise/shared/exams';
import { invigilatorPool } from './invigilators';
import { SeatingProblem } from './solver.client';

export interface BuiltRequest {
  request: SolverSeatingRequestV1;
  /** What seats and duties print, by id. */
  rollNo: Map<string, string>;
  paperCode: Map<string, string>;
  hallCode: Map<string, string>;
  facultyName: Map<string, string>;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * The solver-seating.v1 request for one plan, read from the date sheet, students, seat needs
 * and rooms (P1's tables, read-only).
 */
export async function buildSeatingRequest(tx: TxClient, planId: string): Promise<BuiltRequest> {
  const plan = await tx.seatingPlan.findUniqueOrThrow({
    where: { id: planId },
    include: {
      session: { include: { exam: true, papers: { include: { course: true } } } },
    },
  });
  const { session } = plan;
  const { exam } = session;
  if (session.papers.length === 0) {
    throw new SeatingProblem('This session has no papers yet. Add them to the date sheet first.');
  }

  const sectionIds = [...new Set(session.papers.flatMap((p) => p.sectionIds))];
  const students = await tx.student.findMany({
    where: { sectionId: { in: sectionIds }, status: 'active', deletedAt: null },
    include: { section: true },
  });
  const needs = new Set(
    (
      await tx.examSeatNeed.findMany({
        where: { studentId: { in: students.map((s) => s.id) } },
        select: { studentId: true },
      })
    ).map((n) => n.studentId),
  );
  const paperBySection = new Map<string, { id: string; code: string }>();
  for (const paper of session.papers) {
    for (const sectionId of paper.sectionIds) {
      const before = paperBySection.get(sectionId);
      if (before) {
        const name = students.find((s) => s.sectionId === sectionId)?.section?.displayName;
        throw new SeatingProblem(
          `${name ?? 'A section'} has ${before.code} and ${paper.course.code} in the same session ` +
            `(${shortDate(iso(session.date))}, ${session.label}). Fix the date sheet first.`,
        );
      }
      paperBySection.set(sectionId, { id: paper.id, code: paper.course.code });
    }
  }
  if (students.length === 0) {
    throw new SeatingProblem('No active students are in the sections writing this session.');
  }

  const rooms = await tx.room.findMany({
    where: {
      deletedAt: null,
      ...(plan.hallIds.length > 0 ? { id: { in: plan.hallIds } } : {}),
    },
    orderBy: [{ floor: 'asc' }, { code: 'asc' }],
  });
  const position = new Map(plan.hallIds.map((id, i) => [id, i]));
  const ordered =
    plan.hallIds.length > 0
      ? [...rooms].sort((a, b) => position.get(a.id)! - position.get(b.id)!)
      : rooms;
  const halls = ordered.flatMap((room, i) => hallFromRoom(room, i) ?? []);
  if (halls.length === 0) {
    throw new SeatingProblem(
      'None of these rooms has exam seats. Set rows, seats per row and exam seats per bench in Rooms.',
    );
  }

  const request: SolverSeatingRequestV1 = {
    version: 'solver-seating.v1',
    requestId: plan.id,
    examSessionId: session.id,
    date: iso(session.date),
    sessionLabel: session.label,
    papers: session.papers.map((p) => ({ id: p.id, code: p.course.code, title: p.course.title })),
    students: students.map((s) => ({
      id: s.id,
      rollNo: s.universityRollNo ?? s.classRollNo,
      paperId: paperBySection.get(s.sectionId!)!.id,
      sectionId: s.sectionId,
      needsAccessibleSeat: needs.has(s.id),
    })),
    halls,
    faculty: await invigilatorPool(
      tx,
      { id: session.id, examId: exam.id, termId: exam.termId },
      session.papers,
    ),
    options: {
      reserveSeatsPerHall: exam.reserveSeatsPerHall,
      invigilators: {
        minimumPerHall: exam.minInvigilatorsPerHall,
        studentsPerInvigilator: exam.studentsPerInvigilator,
      },
      timeLimitSeconds: 30,
      seed: 0,
    },
  };
  return {
    request,
    rollNo: new Map(request.students.map((s) => [s.id, s.rollNo])),
    paperCode: new Map(request.papers.map((p) => [p.id, p.code])),
    hallCode: new Map(halls.map((h) => [h.id, h.code])),
    facultyName: new Map(request.faculty.map((f) => [f.id, f.name])),
  };
}
