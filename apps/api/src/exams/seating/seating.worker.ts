import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@slotwise/db';
import type { StoredSeatingProblems } from '@slotwise/shared/exams';
import type { Queue } from 'bullmq';
import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../../db/prisma.service';
import { QueueService } from '../../queue/queue.service';
import { buildSeatingRequest } from './request';
import { SeatingProblem, SeatingSolverClient } from './solver.client';

export const SEATING_QUEUE = 'p6.seating';

export interface SeatingJobData {
  planId: string;
  instituteId: string;
}

const GENERIC_FAILURE =
  'Something went wrong while building the seating plan. Please try again; if it keeps happening, contact support.';

const json = (value: unknown) => value as Prisma.InputJsonValue;

/**
 * Runs seating jobs from the `p6.seating` queue: date sheet + rooms → solver → seats and
 * duties on the plan. Never runs inside an HTTP request (CLAUDE.md).
 */
@Injectable()
export class SeatingWorker implements OnModuleInit {
  private readonly logger = new Logger(SeatingWorker.name);
  private queue: Queue<SeatingJobData> | null = null;
  private started = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly solver: SeatingSolverClient,
  ) {}

  onModuleInit(): void {
    // Tests (and CI, which has no Redis) start the worker only when something is enqueued.
    if (this.env.NODE_ENV !== 'test') this.start();
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    this.queue = this.queues.queue<SeatingJobData>(SEATING_QUEUE);
    this.queue.on('error', (e) => this.logger.error(`queue: ${e.message}`));
    const worker = this.queues.worker<SeatingJobData>(
      SEATING_QUEUE,
      (job) => this.process(job.data),
      { concurrency: 1 },
    );
    worker.on('error', (e) => this.logger.error(`worker: ${e.message}`));
  }

  /** Queues a job. Fails after 5 s rather than holding the HTTP request while Redis is down. */
  async enqueue(data: SeatingJobData): Promise<void> {
    this.start();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Redis did not answer within 5 s')), 5000);
    });
    try {
      await Promise.race([
        this.queue!.add('seat', data, {
          jobId: data.planId,
          removeOnComplete: 100,
          removeOnFail: 100,
        }),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** One seating job. Safe to run again for the same plan (BullMQ re-delivers stalled jobs). */
  async process({ planId, instituteId }: SeatingJobData): Promise<void> {
    const ctx = { instituteId, userId: null };
    const plan = await this.prisma.tenant(ctx, (tx) =>
      tx.seatingPlan.findUnique({ where: { id: planId } }),
    );
    if (!plan || !['queued', 'running'].includes(plan.status)) return;
    const tenant = { instituteId, userId: plan.createdById };

    try {
      const built = await this.prisma.tenant(tenant, async (tx) => {
        await tx.seatingPlan.update({
          where: { id: planId },
          data: { status: 'running', error: null },
        });
        // A re-delivered job starts again from an empty plan.
        await tx.seatAssignment.deleteMany({ where: { planId } });
        await tx.invigilationDuty.deleteMany({ where: { planId } });
        return buildSeatingRequest(tx, planId);
      });

      const response = await this.solver.solve(built.request);

      const problems: StoredSeatingProblems = {
        unseated: response.unseated.map((u) => ({
          ...u,
          rollNo: built.rollNo.get(u.studentId) ?? '',
        })),
        invigilationProblems: response.invigilationProblems,
      };
      const geometry = new Map(built.request.halls.map((h) => [h.id, h]));
      // Stored with what charts need, so a published plan prints the same after room edits.
      const halls = response.halls.map((h) => {
        const g = geometry.get(h.hallId);
        return {
          ...h,
          code: built.hallCode.get(h.hallId) ?? '',
          rows: g?.rows ?? 0,
          columns: g ? g.benchesPerRow * g.seatsPerBench : 0,
        };
      });
      // One batch transaction, not an interactive one: a few thousand seats can take longer
      // than Prisma's 5-second interactive limit on a slow machine. RLS settings go first.
      await this.prisma.$transaction([
        this.prisma.$executeRaw`SELECT set_config('app.institute_id', ${instituteId}, true),
                                       set_config('app.user_id', ${tenant.userId}, true)`,
        this.prisma.seatAssignment.createMany({
          data: response.seats.map((s) => ({
            instituteId,
            planId,
            studentId: s.studentId,
            rollNo: built.rollNo.get(s.studentId) ?? '',
            paperId: s.paperId,
            paperCode: built.paperCode.get(s.paperId) ?? '',
            hallId: s.hallId,
            hallCode: built.hallCode.get(s.hallId) ?? '',
            row: s.row,
            column: s.column,
            label: s.label,
          })),
        }),
        this.prisma.invigilationDuty.createMany({
          data: response.halls.flatMap((h) =>
            h.invigilatorIds.map((facultyId) => ({
              instituteId,
              planId,
              facultyId,
              facultyName: built.facultyName.get(facultyId) ?? '',
              hallId: h.hallId,
              hallCode: built.hallCode.get(h.hallId) ?? '',
            })),
          ),
        }),
        this.prisma.seatingPlan.update({
          where: { id: planId },
          data: {
            status: 'ready',
            solverStatus: response.status,
            problems: json(problems),
            halls: json(halls),
          },
        }),
      ]);
    } catch (error) {
      const message = error instanceof SeatingProblem ? error.message : GENERIC_FAILURE;
      if (!(error instanceof SeatingProblem)) {
        this.logger.error(
          `seating plan ${planId} failed`,
          error instanceof Error ? error.stack : error,
        );
      }
      await this.prisma.tenant(tenant, (tx) =>
        tx.seatingPlan.update({
          where: { id: planId },
          data: { status: 'failed', error: message },
        }),
      );
    }
  }
}
