import { setTimeout as sleep } from 'node:timers/promises';
import type {
  SolverTimetableRequestV1,
  SolverTimetableResponseV1,
} from '@slotwise/shared/contracts';
import { demoTermSolution } from '@slotwise/shared/fixtures';

/**
 * Stand-in for P2E's solver until it is on `main` (SOLVER_SOURCE=mock): waits `delayMs`, then
 * answers with the demo term's solution, whatever was asked, except that locked sessions stay
 * exactly where the request says (as the real solver does). Only matches the fixture snapshot.
 * Remove when INT says the solver has landed.
 */
export async function mockSolve(
  request: SolverTimetableRequestV1,
  delayMs: number,
): Promise<SolverTimetableResponseV1> {
  await sleep(delayMs);
  const solution = demoTermSolution();
  const locked = new Map(request.options.lockedSessions.map((p) => [p.sessionId, p]));
  return {
    ...solution,
    requestId: request.requestId,
    placed: solution.placed.map((p) => {
      const keep = locked.get(p.sessionId);
      return keep ? { ...p, ...keep, locked: true } : p;
    }),
  };
}
