import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma, TxClient } from '@slotwise/db';
import { can } from '@slotwise/shared';
import type {
  GenerateTimetableInput,
  SolveJobDto,
  SolveSummary,
  VersionSummaryDto,
} from '@slotwise/shared/timetable';
import type { Tenant } from '../common/request-context';
import { PrismaService } from '../db/prisma.service';
import { SolveWorker } from './jobs/solve.worker';

const NOT_ALLOWED =
  'You don’t have permission to generate timetables for these classes. Ask your institute admin.';

type SolveJob = Prisma.SolveJobGetPayload<{ include: { resultVersion: { select: { id: true } } } }>;

function jobDto(job: SolveJob): SolveJobDto {
  return {
    id: job.id,
    termId: job.termId,
    scopeId: job.scopeId,
    status: job.status,
    progress: job.progress,
    versionId: job.resultVersion?.id ?? null,
    // Written only by SolveWorker as a SolveSummary.
    summary: (job.resultSummary as unknown as SolveSummary | null) ?? null,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}

const withVersion = { resultVersion: { select: { id: true } } } as const;

/** Starting solve jobs, following them, and listing a term's versions (drafts included). */
@Injectable()
export class TimetableGenerateService {
  private readonly logger = new Logger(TimetableGenerateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly worker: SolveWorker,
  ) {}

  private ctx(tenant: Tenant) {
    return { instituteId: tenant.institute.id, userId: tenant.user.id };
  }

  /**
   * The departments whose classes a generate touches. A whole-term timetable belongs to the
   * institute (null); a scope's belongs to the departments of its cohorts.
   */
  private async departmentsOf(tx: TxClient, scopeId: string | null): Promise<(string | null)[]> {
    if (!scopeId) return [null];
    const rows = await tx.timetableScopeCohort.findMany({
      where: { scopeId },
      select: {
        cohort: { select: { batch: { select: { branch: { select: { departmentId: true } } } } } },
      },
    });
    const ids = [...new Set(rows.map((r) => r.cohort.batch.branch.departmentId))];
    return ids.length ? ids : [null];
  }

  async generate(
    tenant: Tenant,
    termId: string,
    input: GenerateTimetableInput,
  ): Promise<SolveJobDto> {
    const job = await this.prisma.tenant(this.ctx(tenant), async (tx) => {
      const term = await tx.term.findFirst({ where: { id: termId, deletedAt: null } });
      if (!term) throw new NotFoundException('We could not find this term.');
      if (input.scopeId) {
        const scope = await tx.timetableScope.findFirst({
          where: { id: input.scopeId, termId, deletedAt: null },
        });
        if (!scope)
          throw new NotFoundException('We could not find this timetable group in the term.');
      }
      const departments = await this.departmentsOf(tx, input.scopeId);
      const allowed = departments.every((departmentId) =>
        can(tenant.authUser, 'timetable.edit', {
          type: 'timetable',
          instituteId: tenant.institute.id,
          departmentId,
        }),
      );
      if (!allowed) throw new ForbiddenException(NOT_ALLOWED);

      // A second click while one is running follows the running one.
      const running = await tx.solveJob.findFirst({
        where: { termId, scopeId: input.scopeId, status: { in: ['queued', 'running'] } },
        include: withVersion,
      });
      if (running) return { job: running, isNew: false };
      const created = await tx.solveJob.create({
        data: {
          instituteId: tenant.institute.id,
          termId,
          scopeId: input.scopeId,
          cohortIds: [],
          options: { timeLimitSeconds: input.timeLimitSeconds, seed: input.seed },
          createdById: tenant.user.id,
        },
        include: withVersion,
      });
      return { job: created, isNew: true };
    });

    if (job.isNew) {
      try {
        await this.worker.enqueue({ solveJobId: job.job.id, instituteId: tenant.institute.id });
      } catch (error) {
        this.logger.error(
          'could not queue a solve job',
          error instanceof Error ? error.stack : error,
        );
        await this.prisma.tenant(this.ctx(tenant), (tx) =>
          tx.solveJob.update({
            where: { id: job.job.id },
            data: {
              status: 'failed',
              error: 'Generating is not available right now. Please try again in a few minutes.',
              finishedAt: new Date(),
            },
          }),
        );
        throw new ServiceUnavailableException(
          'Generating is not available right now. Please try again in a few minutes.',
        );
      }
    }
    return jobDto(job.job);
  }

  async job(tenant: Tenant, jobId: string): Promise<SolveJobDto> {
    const job = await this.prisma.tenant(this.ctx(tenant), (tx) =>
      tx.solveJob.findUnique({ where: { id: jobId }, include: withVersion }),
    );
    if (!job) throw new NotFoundException('We could not find this timetable run.');
    return jobDto(job);
  }

  /** Recent runs of a term, newest first (to resume a progress bar after a reload). */
  async jobs(tenant: Tenant, termId: string): Promise<SolveJobDto[]> {
    const jobs = await this.prisma.tenant(this.ctx(tenant), (tx) =>
      tx.solveJob.findMany({
        where: { termId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: withVersion,
      }),
    );
    return jobs.map(jobDto);
  }

  async versions(tenant: Tenant, termId: string): Promise<VersionSummaryDto[]> {
    const rows = await this.prisma.tenant(this.ctx(tenant), (tx) =>
      tx.timetableVersion.findMany({
        where: { termId },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { slots: true } } },
      }),
    );
    return rows.map((v) => ({
      id: v.id,
      termId: v.termId,
      scopeId: v.scopeId,
      status: v.status,
      number: v.number,
      parentId: v.parentId,
      solveJobId: v.solveJobId,
      slotCount: v._count.slots,
      unplacedCount: Array.isArray(v.unplaced) ? v.unplaced.length : 0,
      createdAt: v.createdAt.toISOString(),
      publishedAt: v.publishedAt?.toISOString() ?? null,
    }));
  }
}
