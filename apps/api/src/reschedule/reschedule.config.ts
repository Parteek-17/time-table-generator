import { z } from 'zod';

/**
 * P4's own settings. Read here rather than in config/env.ts (INT's file) until INT adds them
 * there (requests/2026-10-27-p4-env-variables.md).
 */
const schema = z.object({
  /**
   * api: GET /terms/:termId/snapshot (P1) and GET /terms/:termId/timetable (P2T), called as
   * the user. fixture: demo-term.snapshot.json and demo-term.published-timetable.json.
   */
  RESCHEDULE_SOURCE: z.enum(['api', 'fixture']).default('api'),
});

export type RescheduleConfig = z.infer<typeof schema>;
export const RESCHEDULE_CONFIG = Symbol('RESCHEDULE_CONFIG');

export function loadRescheduleConfig(source: NodeJS.ProcessEnv = process.env): RescheduleConfig {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(
      `Invalid rescheduling settings (see apps/api/.env.example):\n${problems.join('\n')}`,
    );
  }
  return parsed.data;
}
