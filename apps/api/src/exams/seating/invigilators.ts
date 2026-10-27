import type { TxClient } from '@slotwise/db';
import type { SolverSeatingRequestV1 } from '@slotwise/shared/contracts';

type SeatingFaculty = SolverSeatingRequestV1['faculty'][number];

/**
 * Duties each faculty member already has in the exam's other sessions: from each session's
 * published plan, else its newest ready plan (coordinators often build every session before
 * publishing any).
 */
export async function dutiesSoFar(
  tx: TxClient,
  examId: string,
  exceptSessionId: string,
): Promise<Map<string, number>> {
  const plans = await tx.seatingPlan.findMany({
    where: {
      session: { examId, id: { not: exceptSessionId } },
      status: { in: ['ready', 'published'] },
    },
    select: { id: true, sessionId: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  const published = new Set(plans.filter((p) => p.status === 'published').map((p) => p.sessionId));
  const chosen = new Map<string, string>();
  for (const plan of plans) {
    if (chosen.has(plan.sessionId)) continue;
    if (published.has(plan.sessionId) && plan.status !== 'published') continue;
    chosen.set(plan.sessionId, plan.id);
  }
  const duties = await tx.invigilationDuty.groupBy({
    by: ['facultyId'],
    where: { planId: { in: [...chosen.values()] } },
    _count: { _all: true },
  });
  return new Map(duties.map((d) => [d.facultyId, d._count._all]));
}

/**
 * Everyone who could invigilate a session: every current faculty member, marked unavailable
 * when the coordinator said so for this session, with the session's papers they teach this
 * term (never put in a hall writing one of them).
 */
export async function invigilatorPool(
  tx: TxClient,
  session: { id: string; examId: string; termId: string },
  papers: readonly { id: string; courseId: string }[],
): Promise<SeatingFaculty[]> {
  const [faculty, off, teaching, duties] = await Promise.all([
    tx.faculty.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } }),
    tx.invigilatorUnavailability.findMany({
      where: { sessionId: session.id },
      select: { facultyId: true },
    }),
    tx.teachingAssignmentFaculty.findMany({
      where: {
        assignment: {
          termId: session.termId,
          deletedAt: null,
          courseId: { in: papers.map((p) => p.courseId) },
        },
      },
      select: { facultyId: true, assignment: { select: { courseId: true } } },
    }),
    dutiesSoFar(tx, session.examId, session.id),
  ]);
  const unavailable = new Set(off.map((o) => o.facultyId));
  const paperOfCourse = new Map(papers.map((p) => [p.courseId, p.id]));
  const teaches = new Map<string, Set<string>>();
  for (const t of teaching) {
    const paperId = paperOfCourse.get(t.assignment.courseId);
    if (!paperId) continue;
    const set = teaches.get(t.facultyId) ?? new Set<string>();
    set.add(paperId);
    teaches.set(t.facultyId, set);
  }
  return faculty.map((f) => ({
    id: f.id,
    name: f.name,
    available: !unavailable.has(f.id),
    teachesPaperIds: [...(teaches.get(f.id) ?? [])].sort(),
    dutiesSoFar: duties.get(f.id) ?? 0,
  }));
}
