import { Injectable } from '@nestjs/common';
import { loadReadinessSnapshot, type Prisma } from '@slotwise/db';
import {
  readiness,
  SETUP_STEPS,
  type SetupAttentionDto,
  type SetupStateDto,
  type SetupStep,
  type SetupStepDto,
  type SetupStepUpdateInput,
} from '@slotwise/shared';
import type { Tenant } from '../common/request-context';
import { MasterDataService } from '../masterdata/masterdata.service';

/** Shape of Institute.setup_state (see core.prisma). */
interface StoredState {
  completed: SetupStep[];
  skipped: SetupStep[];
  current?: SetupStep;
}

function stored(raw: Prisma.JsonValue): StoredState {
  const value = (raw ?? {}) as Partial<StoredState>;
  const known = (xs: unknown) =>
    Array.isArray(xs) ? xs.filter((x): x is SetupStep => SETUP_STEPS.includes(x as SetupStep)) : [];
  return {
    completed: known(value.completed),
    skipped: known(value.skipped),
    current: SETUP_STEPS.includes(value.current as SetupStep) ? value.current : undefined,
  };
}

/**
 * Setup wizard progress (docs/phase1/plan.md §5): what the admin marked done or skipped,
 * what data each step already has, and what needs attention, with the screen that fixes it.
 */
@Injectable()
export class SetupService {
  constructor(private readonly md: MasterDataService) {}

  state(tenant: Tenant): Promise<SetupStateDto> {
    return this.md.run(tenant, async ({ tx }) => {
      const institute = await tx.institute.findUniqueOrThrow({
        where: { id: tenant.institute.id },
      });
      const marks = stored(institute.setupState);
      const live = { deletedAt: null };
      const activeTerm = await tx.term.findFirst({ where: { status: 'active', ...live } });
      const [departments, programmes, schemes, terms, batches, faculty, rooms, bells] =
        await Promise.all([
          tx.department.count({ where: live }),
          tx.programme.count({ where: live }),
          tx.schemeVersion.count({ where: live }),
          tx.term.count({ where: live }),
          tx.batch.count({ where: { ...live, status: 'active' } }),
          tx.faculty.count({ where: live }),
          tx.room.count({ where: live }),
          tx.bellSchedule.count({ where: { ...live, isDefault: true } }),
        ]);
      const [cohorts, cohortsWithoutSections, holidays, assignments] = activeTerm
        ? await Promise.all([
            tx.cohort.count({ where: { termId: activeTerm.id, ...live } }),
            tx.cohort.count({
              where: {
                termId: activeTerm.id,
                isRunning: true,
                joinsCohortId: null,
                ...live,
                sections: { none: live },
              },
            }),
            tx.holiday.count({
              where: {
                ...live,
                endDate: { gte: activeTerm.startDate },
                startDate: { lte: activeTerm.endDate },
              },
            }),
            tx.teachingAssignment.count({
              where: { termId: activeTerm.id, ...live, faculty: { some: {} } },
            }),
          ])
        : [0, 0, 0, 0];
      // Issues of the readiness check, once there is something to check.
      const readinessErrors =
        activeTerm && cohorts > 0
          ? readiness(await loadReadinessSnapshot(tx, activeTerm.id)).errorCount
          : 0;

      const counts: Record<SetupStep, number> = {
        profile: 1,
        departments,
        programmes,
        schemes,
        term: terms,
        cohorts: batches,
        faculty,
        rooms,
        bell: bells,
        calendar: holidays,
        teaching: assignments,
        ready: readinessErrors,
      };
      const steps: SetupStepDto[] = SETUP_STEPS.map((id) => ({
        id,
        status: marks.completed.includes(id)
          ? 'done'
          : marks.skipped.includes(id)
            ? 'skipped'
            : 'todo',
        hasData:
          id === 'term'
            ? activeTerm != null
            : id === 'ready'
              ? activeTerm != null && cohorts > 0 && readinessErrors === 0
              : counts[id] > 0,
        count: counts[id],
        available: true,
      }));
      const available = steps.filter((s) => s.available);
      const finished = available.filter((s) => s.status !== 'todo').length;

      const attention: SetupAttentionDto[] = [];
      const need = (when: boolean, item: SetupAttentionDto) => {
        if (when) attention.push(item);
      };
      need(departments === 0, { code: 'no_departments', count: 0, href: '/setup/departments' });
      need(programmes === 0, { code: 'no_programmes', count: 0, href: '/setup/programmes' });
      need(!activeTerm, { code: 'no_active_term', count: 0, href: '/setup/term' });
      need(activeTerm != null && batches > 0 && cohorts === 0, {
        code: 'no_cohorts',
        count: batches,
        href: '/setup/cohorts',
      });
      need(cohortsWithoutSections > 0, {
        code: 'cohorts_without_sections',
        count: cohortsWithoutSections,
        href: '/setup/cohorts',
      });
      need(faculty === 0, { code: 'no_faculty', count: 0, href: '/setup/faculty' });
      need(rooms === 0, { code: 'no_rooms', count: 0, href: '/setup/rooms' });
      need(bells === 0, { code: 'no_bell_schedule', count: 0, href: '/setup/bell' });
      need(readinessErrors > 0, {
        code: 'readiness_issues',
        count: readinessErrors,
        href: '/readiness',
      });

      return {
        steps,
        nextStep: available.find((s) => s.status === 'todo')?.id ?? null,
        percent: available.length ? Math.round((finished / available.length) * 100) : 100,
        attention,
        activeTermId: activeTerm?.id ?? null,
      };
    });
  }

  /** Marks a step done, skipped for now, or to-do again (save and resume). */
  async mark(tenant: Tenant, step: SetupStep, input: SetupStepUpdateInput): Promise<SetupStateDto> {
    await this.md.run(tenant, async (ctx) => {
      this.md.assertCan(tenant, 'institute.manage', this.md.resource(tenant, 'institute', null));
      const institute = await ctx.tx.institute.findUniqueOrThrow({
        where: { id: tenant.institute.id },
      });
      const marks = stored(institute.setupState);
      const next: StoredState = {
        completed: marks.completed.filter((s) => s !== step),
        skipped: marks.skipped.filter((s) => s !== step),
      };
      if (input.status === 'done') next.completed.push(step);
      if (input.status === 'skipped') next.skipped.push(step);
      const after = SETUP_STEPS[SETUP_STEPS.indexOf(step) + 1];
      next.current = input.status === 'todo' ? step : (after ?? step);
      // institutes is a global table (no RLS): update only the current institute, by id.
      await ctx.tx.institute.update({
        where: { id: tenant.institute.id },
        data: { setupState: next as unknown as Prisma.InputJsonObject },
      });
      await this.md.audit(ctx, `setup.step_${input.status}`, 'institute', tenant.institute.id, {
        step,
      });
    });
    return this.state(tenant);
  }
}
