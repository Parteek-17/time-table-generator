/**
 * Timetable scopes: which running cohorts one timetable covers. Saved here (Phase 1) and
 * used by Phase 2's generate. A scope whose cohorts are all in one department belongs to
 * that department (its coordinator may manage it); otherwise to the institute.
 */
import type { Prisma } from '@slotwise/db';
import {
  timetableScopeSchema,
  type TimetableScopeInput,
  type TimetableScopeRow,
} from '@slotwise/shared';
import { requireRefs, type EntityDef } from '../masterdata/entity';

const scopeInclude = {
  cohorts: { orderBy: { cohortId: 'asc' } },
  createdBy: { select: { name: true, email: true } },
} satisfies Prisma.TimetableScopeInclude;
type ScopeDb = Prisma.TimetableScopeGetPayload<{ include: typeof scopeInclude }>;

export const timetableScopes: EntityDef<TimetableScopeInput, ScopeDb, TimetableScopeRow> = {
  name: 'timetable_scope',
  path: 'timetable-scopes',
  manage: 'timetable_scope.manage',
  resourceType: 'timetable_scope',
  schema: timetableScopeSchema,
  model: (tx) => tx.timetableScope,
  include: scopeInclude,
  orderBy: [{ createdAt: 'asc' }],
  listWhere: (q) => (q.termId ? { termId: q.termId } : {}),
  async departmentOf({ tx }, values) {
    const rows = await tx.cohort.findMany({
      where: { id: { in: values.cohortIds } },
      select: { batch: { select: { branch: { select: { departmentId: true } } } } },
    });
    const ids = [...new Set(rows.map((r) => r.batch.branch.departmentId))];
    return ids.length === 1 ? ids[0]! : null;
  },
  async toData({ tx, tenant }, input, existing) {
    await requireRefs([
      ['termId', tx.term, input.termId, 'Choose a term.'],
      ...[...new Set(input.cohortIds)].map(
        (cohortId) =>
          [
            'cohortIds',
            tx.cohort,
            cohortId,
            'Tick running cohorts of this term only.',
            { termId: input.termId, isRunning: true },
          ] as const,
      ),
    ]);
    return {
      termId: input.termId,
      name: input.name,
      notes: input.notes,
      ...(existing ? {} : { createdById: tenant.user.id }),
    };
  },
  async afterWrite({ tx, tenant }, row, input) {
    await tx.timetableScopeCohort.deleteMany({ where: { scopeId: row.id } });
    await tx.timetableScopeCohort.createMany({
      data: [...new Set(input.cohortIds)].map((cohortId) => ({
        instituteId: tenant.institute.id,
        scopeId: row.id,
        cohortId,
      })),
    });
  },
  toInput: (row) => ({
    termId: row.termId,
    name: row.name,
    notes: row.notes,
    cohortIds: row.cohorts.map((c) => c.cohortId),
  }),
  extras: (row) => ({ createdByName: row.createdBy.name ?? row.createdBy.email }),
  duplicate: () => 'A timetable scope with this name already exists.',
};
