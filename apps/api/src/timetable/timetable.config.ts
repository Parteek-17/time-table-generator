import { z } from 'zod';

/**
 * P2T's own settings. Read here rather than in config/env.ts (INT's file) until INT adds them
 * there (requests/2026-10-23-p2t-env-variables.md).
 */
const schema = z.object({
  /** fixture: demo-term.snapshot.json; api: GET /terms/:termId/snapshot (P1). */
  SNAPSHOT_SOURCE: z.enum(['fixture', 'api']).default('fixture'),
  /** mock: demo-term.solution.json after a short delay; http: POST {SOLVER_URL}/v1/timetable/solve. */
  SOLVER_SOURCE: z.enum(['mock', 'http']).default('mock'),
  /** How long the mock solver pretends to work, in milliseconds. */
  SOLVER_MOCK_DELAY_MS: z.coerce.number().int().min(0).default(3000),
});

export type TimetableConfig = z.infer<typeof schema>;
export const TIMETABLE_CONFIG = Symbol('TIMETABLE_CONFIG');

export function loadTimetableConfig(source: NodeJS.ProcessEnv = process.env): TimetableConfig {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(
      `Invalid timetable settings (see apps/api/.env.example):\n${problems.join('\n')}`,
    );
  }
  return parsed.data;
}
