/**
 * Fictional fixtures for building against contracts before the producer lands
 * (`@slotwise/shared/fixtures`). Built from P1's sample institute ("Demo Institute of
 * Engineering") by `pnpm fixtures:build`; each loader validates against its contract.
 * The raw JSON is also exported: `@slotwise/shared/fixtures/<name>.json`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { z } from 'zod';
import { SetupSnapshotV1 } from '../contracts/setup-snapshot.v1';
import { SolverSeatingRequestV1, SolverSeatingResponseV1 } from '../contracts/solver-seating.v1';
import { SolverTimetableResponseV1 } from '../contracts/solver-timetable.v1';
import { TimetableReadResponseV1 } from '../contracts/timetable-read.v1';
import { TodayV1 } from '../contracts/portal-read.v1';

/** packages/shared/fixtures, from src/fixtures (tests) or dist/fixtures (built). */
export const FIXTURES_DIR = join(__dirname, '..', '..', 'fixtures');

/** Fixture file → the contract it follows. */
export const FIXTURE_CONTRACTS = {
  'demo-term.snapshot.json': SetupSnapshotV1,
  'demo-term.solution.json': SolverTimetableResponseV1,
  'demo-term.published-timetable.json': TimetableReadResponseV1,
  'demo-exam.seating-request.json': SolverSeatingRequestV1,
  'demo-exam.seating-response.json': SolverSeatingResponseV1,
  'demo-student.today.json': TodayV1,
} as const satisfies Record<string, z.ZodType>;

export type FixtureName = keyof typeof FIXTURE_CONTRACTS;

export function loadFixture<N extends FixtureName>(
  name: N,
): z.infer<(typeof FIXTURE_CONTRACTS)[N]> {
  const raw: unknown = JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf8'));
  return FIXTURE_CONTRACTS[name].parse(raw) as z.infer<(typeof FIXTURE_CONTRACTS)[N]>;
}

/** The demo term's master data (every cohort of July–Dec 2026). */
export const demoTermSnapshot = () => loadFixture('demo-term.snapshot.json');
/** A solver answer for demoTermSnapshot() (placeholder solution, not optimised). */
export const demoTermSolution = () => loadFixture('demo-term.solution.json');
/** The published timetable of one section (the fullest week), as the read API returns it. */
export const demoPublishedTimetable = () => loadFixture('demo-term.published-timetable.json');
/** A seating request for one exam session. */
export const demoExamSeatingRequest = () => loadFixture('demo-exam.seating-request.json');
/** A seating answer for demoExamSeatingRequest(). */
export const demoExamSeatingResponse = () => loadFixture('demo-exam.seating-response.json');
/** A student's "Today" screen on a teaching Monday. */
export const demoStudentToday = () => loadFixture('demo-student.today.json');
