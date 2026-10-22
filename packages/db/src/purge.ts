/**
 * Hard-deletes every row of one institute, children first. For tests and for rebuilding the
 * fictional demo institute only: needs the owner connection (the app role may not delete
 * audit logs), and real institutes are never hard-deleted (CLAUDE.md "Things to avoid").
 */
import type { PrismaClient } from '@prisma/client';

/** Tenant tables in an order that respects foreign keys (children before parents). */
export const TENANT_TABLES_DELETE_ORDER = [
  'import_rows',
  'import_jobs',
  'timetable_scope_cohorts',
  'timetable_scopes',
  'subject_mentors',
  'teaching_assignment_faculty',
  'teaching_assignments',
  'student_electives',
  'students',
  'elective_section_sources',
  'elective_sections',
  'fixed_slot_faculty',
  'fixed_slots',
  'faculty_unavailability',
  'faculty_departments',
  'calendar_windows',
  'holidays',
  'extra_working_days',
  'sub_groups',
  'sections',
  'cohorts',
  'batches',
  'faculty',
  'rooms',
  'buildings',
  'bell_breaks',
  'bell_periods',
  'bell_schedule_programmes',
  'bell_schedules',
  'term_cohort_windows',
  'terms',
  'academic_sessions',
  'course_branches',
  'courses',
  'scheme_versions',
  'branches',
  'programmes',
  'invites',
  'memberships',
  'audit_logs',
  'departments',
] as const;

/** Deletes the institute's master data. With `includeInstitute`, the institute row too. */
export async function purgeInstitute(
  owner: PrismaClient,
  instituteId: string,
  options: { keepPhase0?: boolean; includeInstitute?: boolean } = {},
): Promise<void> {
  const phase0 = new Set(['invites', 'memberships', 'audit_logs', 'departments']);
  await owner.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE cohorts SET joins_cohort_id = NULL WHERE institute_id = ${instituteId}::uuid`;
    for (const table of TENANT_TABLES_DELETE_ORDER) {
      if (options.keepPhase0 && phase0.has(table)) continue;
      // Table names come from the constant above, never from input.
      await tx.$executeRawUnsafe(
        `DELETE FROM "${table}" WHERE institute_id = $1::uuid`,
        instituteId,
      );
    }
    if (options.includeInstitute) {
      await tx.$executeRaw`DELETE FROM institutes WHERE id = ${instituteId}::uuid`;
    }
  });
}
