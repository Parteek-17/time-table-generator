import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@slotwise/db';
import type {
  PlacementV1,
  SetupSnapshotV1,
  SolverTimetableRequestV1,
} from '@slotwise/shared/contracts';
import {
  GenerateTimetableInput,
  SnapshotMismatchError,
  slotsFromPlacements,
  type SolveSummary,
} from '@slotwise/shared/timetable';
import type { Queue } from 'bullmq';
import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../../db/prisma.service';
import { QueueService } from '../../queue/queue.service';
import { publishedBusySlots } from '../busy';
import { TIMETABLE_CONFIG, type TimetableConfig } from '../timetable.config';
import { SnapshotClient, SolveProblem, SolverClient } from './clients';

export const SOLVE_QUEUE = 'p2t.solve';

export interface SolveJobData {
  solveJobId: string;
  instituteId: string;
}

const GENERIC_FAILURE =
  'Something went wrong while generating the timetable. Please try again; if it keeps happening, contact support.';

/** sha256 of a snapshot without its generatedAt, so the same setup data gives the same hash. */
export function snapshotHash(snapshot: SetupSnapshotV1): string {
  const { generatedAt: _generatedAt, ...stable } = snapshot;
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

const json = (value: unknown) => value as Prisma.InputJsonValue;

/**
 * Runs solve jobs from the `p2t.solve` queue: snapshot → solver → draft version. Progress and
 * the outcome are written to the timetable_solve_jobs row, which the web polls. Never runs
 * inside an HTTP request (CLAUDE.md).
 */
@Injectable()
export class SolveWorker implements OnModuleInit {
  private readonly logger = new Logger(SolveWorker.name);
  private queue: Queue<SolveJobData> | null = null;
  private started = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(TIMETABLE_CONFIG) private readonly config: TimetableConfig,
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly snapshots: SnapshotClient,
    private readonly solver: SolverClient,
  ) {}

  onModuleInit(): void {
    // Tests (and CI, which has no Redis) start the worker only when something is enqueued.
    if (this.env.NODE_ENV !== 'test') this.start();
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    this.queue = this.queues.queue<SolveJobData>(SOLVE_QUEUE);
    this.queue.on('error', (e) => this.logger.error(`queue: ${e.message}`));
    const worker = this.queues.worker<SolveJobData>(SOLVE_QUEUE, (job) => this.process(job.data), {
      concurrency: 2,
    });
    worker.on('error', (e) => this.logger.error(`worker: ${e.message}`));
  }

  /** Queues a job. Fails after 5 s rather than holding the HTTP request while Redis is down. */
  async enqueue(data: SolveJobData): Promise<void> {
    this.start();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Redis did not answer within 5 s')), 5000);
    });
    try {
      await Promise.race([
        this.queue!.add('solve', data, {
          jobId: data.solveJobId,
          removeOnComplete: 100,
          removeOnFail: 100,
        }),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** One solve job. Safe to run again for the same job (BullMQ re-delivers stalled jobs). */
  async process({ solveJobId, instituteId }: SolveJobData): Promise<void> {
    const institute = await this.prisma.institute.findUnique({ where: { id: instituteId } });
    if (!institute) return;
    const ctx = { instituteId, userId: null };
    const job = await this.prisma.tenant(ctx, (tx) =>
      tx.solveJob.findUnique({ where: { id: solveJobId } }),
    );
    if (!job || !['queued', 'running'].includes(job.status)) return;
    const tenant = { ...ctx, userId: job.createdById };
    const setJob = (data: Prisma.SolveJobUncheckedUpdateManyInput) =>
      this.prisma.tenant(tenant, (tx) =>
        tx.solveJob.updateMany({ where: { id: solveJobId, status: 'running' }, data }),
      );

    await this.prisma.tenant(tenant, (tx) =>
      tx.solveJob.update({
        where: { id: solveJobId },
        data: { status: 'running', progress: 5, startedAt: new Date(), error: null },
      }),
    );
    try {
      const input = GenerateTimetableInput.parse(job.options);
      const snapshot = await this.snapshots.get({
        instituteSlug: institute.slug,
        userId: job.createdById,
        termId: job.termId,
        scopeId: job.scopeId,
      });
      const hash = snapshotHash(snapshot);
      const stored = await this.prisma.tenant(tenant, (tx) =>
        tx.timetableSnapshot.upsert({
          where: { instituteId_hash: { instituteId, hash } },
          update: {},
          create: { instituteId, termId: job.termId, hash, data: json(snapshot) },
        }),
      );
      await setJob({ progress: 20 });

      const request: SolverTimetableRequestV1 = {
        version: 'solver-timetable.v1',
        requestId: solveJobId,
        snapshot,
        options: {
          timeLimitSeconds: input.timeLimitSeconds,
          seed: input.seed,
          lockedSessions: job.baseVersionId
            ? await this.lockedSessions(tenant, job.baseVersionId)
            : [],
          busySlots: await this.prisma.tenant(tenant, (tx) =>
            publishedBusySlots(
              tx,
              job.termId,
              job.scopeId,
              new Set(snapshot.sections.map((x) => x.id)),
            ),
          ),
          weights: {},
        },
      };
      const requestHash = createHash('sha256')
        .update(hash)
        .update(JSON.stringify(request.options))
        .digest('hex');
      await setJob({ progress: 30, requestHash, snapshotId: stored.id });

      const response = await this.withProgress(setJob, input.timeLimitSeconds, () =>
        this.solver.solve(request),
      );

      let slots;
      try {
        slots = slotsFromPlacements(snapshot, response.placed);
      } catch (error) {
        if (!(error instanceof SnapshotMismatchError)) throw error;
        throw new SolveProblem(
          'The timetable engine’s answer does not match this term’s setup data. Please generate again.',
        );
      }
      const summary: SolveSummary = {
        solverStatus: response.status,
        placed: response.placed.length,
        unplaced: response.unplaced.length,
        solveSeconds: response.solveSeconds,
        scoreTotal: response.score.total,
      };
      const cohortIds =
        snapshot.scope?.cohortIds ?? snapshot.cohorts.filter((c) => c.isRunning).map((c) => c.id);
      await this.prisma.tenant(tenant, async (tx) => {
        const version = await tx.timetableVersion.create({
          data: {
            instituteId,
            termId: job.termId,
            scopeId: job.scopeId,
            parentId: job.baseVersionId,
            cohortIds,
            snapshotId: stored.id,
            solveJobId,
            unplaced: json(response.unplaced),
            score: json(response.score),
            createdById: job.createdById,
          },
        });
        await tx.timetableSlot.createMany({
          data: slots.map((slot) => ({
            ...slot,
            faculty: json(slot.faculty),
            instituteId,
            versionId: version.id,
          })),
        });
        await tx.solveJob.update({
          where: { id: solveJobId },
          data: {
            status: 'succeeded',
            progress: 100,
            resultSummary: json(summary),
            finishedAt: new Date(),
          },
        });
      });
    } catch (error) {
      const message = error instanceof SolveProblem ? error.message : GENERIC_FAILURE;
      if (!(error instanceof SolveProblem)) {
        this.logger.error(
          `solve job ${solveJobId} failed`,
          error instanceof Error ? error.stack : error,
        );
      }
      await this.prisma.tenant(tenant, (tx) =>
        tx.solveJob.update({
          where: { id: solveJobId },
          data: { status: 'failed', error: message, finishedAt: new Date() },
        }),
      );
    }
  }

  /** Locked classes of the version being re-solved, as placements the solver must keep. */
  private async lockedSessions(
    tenant: { instituteId: string; userId: string },
    versionId: string,
  ): Promise<PlacementV1[]> {
    const locked = await this.prisma.tenant(tenant, (tx) =>
      tx.timetableSlot.findMany({ where: { versionId, locked: true, roomId: { not: null } } }),
    );
    return locked.map((s) => ({
      sessionId: s.sessionId,
      weekday: s.weekday,
      startPeriodIndex: s.startPeriod,
      length: s.length,
      roomId: s.roomId!,
    }));
  }

  /** Moves the job's progress from 30 towards 90 while the solver works. */
  private async withProgress<T>(
    setJob: (data: Prisma.SolveJobUncheckedUpdateManyInput) => Promise<unknown>,
    timeLimitSeconds: number,
    work: () => Promise<T>,
  ): Promise<T> {
    const expectedMs =
      this.config.SOLVER_SOURCE === 'mock'
        ? this.config.SOLVER_MOCK_DELAY_MS
        : timeLimitSeconds * 1000;
    const start = Date.now();
    let pending: Promise<unknown> = Promise.resolve();
    const timer = setInterval(() => {
      const share = Math.min(1, (Date.now() - start) / Math.max(expectedMs, 1));
      pending = pending
        .then(() => setJob({ progress: 30 + Math.round(60 * share) }))
        .catch(() => {});
    }, 1000);
    try {
      return await work();
    } finally {
      clearInterval(timer);
      await pending;
    }
  }
}
