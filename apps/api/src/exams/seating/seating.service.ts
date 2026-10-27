import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma, TxClient } from '@slotwise/db';
import { parseEvent } from '@slotwise/shared/contracts';
import type {
  BuildSeatingInput,
  SeatingHallDto,
  SeatingPlanDto,
  StoredSeatingProblems,
} from '@slotwise/shared/exams';
import type { Tenant } from '../../common/request-context';
import { PrismaService } from '../../db/prisma.service';
import { SeatingWorker } from './seating.worker';

const NO_SESSION = 'We could not find this exam session.';
const NO_PLAN = 'We could not find this seating plan.';

type SeatingPlan = Prisma.SeatingPlanGetPayload<object>;

/** Stored per hall from the solver response, with the hall code. */
export interface StoredHall {
  hallId: string;
  code: string;
  capacity: number;
  used: number;
  reserved: number;
  paperIds: string[];
  invigilatorIds: string[];
  rows: number;
  columns: number;
}

/** Seating plans: start one (a background job), and read it back. */
@Injectable()
export class SeatingService {
  private readonly logger = new Logger(SeatingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly worker: SeatingWorker,
    private readonly events: EventEmitter2,
  ) {}

  private tx<T>(tenant: Tenant, fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return this.prisma.tenant({ instituteId: tenant.institute.id, userId: tenant.user.id }, fn);
  }

  async build(
    tenant: Tenant,
    sessionId: string,
    input: BuildSeatingInput,
  ): Promise<{ planId: string }> {
    const plan = await this.tx(tenant, async (tx) => {
      const session = await tx.examSession.findFirst({
        where: { id: sessionId, exam: { deletedAt: null } },
        include: { _count: { select: { papers: true } } },
      });
      if (!session) throw new NotFoundException(NO_SESSION);
      if (session._count.papers === 0) {
        throw new BadRequestException(
          'This session has no papers yet. Add them to the date sheet first.',
        );
      }
      const hallIds = [...new Set(input.hallIds ?? [])];
      if (hallIds.length > 0) {
        const found = await tx.room.count({ where: { id: { in: hallIds }, deletedAt: null } });
        if (found !== hallIds.length) {
          throw new BadRequestException(
            'Some of these rooms no longer exist. Reload and try again.',
          );
        }
      }
      const busy = await tx.seatingPlan.count({
        where: { sessionId, status: { in: ['queued', 'running'] } },
      });
      if (busy > 0) {
        throw new ConflictException(
          'A seating plan for this session is already being built. Wait for it to finish.',
        );
      }
      return tx.seatingPlan.create({
        data: {
          instituteId: tenant.institute.id,
          sessionId,
          hallIds,
          createdById: tenant.user.id,
        },
      });
    });
    try {
      await this.worker.enqueue({ planId: plan.id, instituteId: tenant.institute.id });
    } catch (error) {
      this.logger.error(`could not queue seating plan ${plan.id}`, error);
      const message = 'Seating plans cannot be built right now. Please try again in a minute.';
      await this.tx(tenant, (tx) =>
        tx.seatingPlan.update({
          where: { id: plan.id },
          data: { status: 'failed', error: message },
        }),
      );
      throw new ServiceUnavailableException(message);
    }
    return { planId: plan.id };
  }

  /**
   * Publishes a ready plan (or an archived one again, which undoes a later publish). The
   * session's earlier published plan is archived, never deleted.
   */
  async publish(tenant: Tenant, planId: string): Promise<SeatingPlanDto> {
    // Only the status changes run in the transaction; the summary is read afterwards. Building
    // it inside took longer than Prisma's 5-second limit on a slow machine and rolled back.
    const event = await this.tx(tenant, async (tx) => {
      const plan = await tx.seatingPlan.findFirst({
        where: { id: planId, session: { exam: { deletedAt: null } } },
        include: { session: { include: { papers: { select: { sectionIds: true } } } } },
      });
      if (!plan) throw new NotFoundException(NO_PLAN);
      if (plan.status === 'published') return null;
      if (plan.status !== 'ready' && plan.status !== 'archived') {
        throw new ConflictException('Only a finished seating plan can be published.');
      }
      await tx.seatingPlan.updateMany({
        where: { sessionId: plan.sessionId, status: 'published' },
        data: { status: 'archived' },
      });
      const now = new Date();
      await tx.seatingPlan.update({
        where: { id: plan.id },
        data: { status: 'published', publishedAt: now },
      });
      const halls = (plan.halls as unknown as StoredHall[]).filter((h) => h.used > 0);
      return parseEvent('exam.seating.published', {
        eventId: randomUUID(),
        occurredAt: now.toISOString(),
        instituteId: tenant.institute.id,
        actorUserId: tenant.user.id,
        seatingPlanId: plan.id,
        examSessionId: plan.sessionId,
        date: plan.session.date.toISOString().slice(0, 10),
        sessionLabel: plan.session.label,
        roomIds: halls.map((h) => h.hallId),
        sectionIds: [...new Set(plan.session.papers.flatMap((p) => p.sectionIds))],
      });
    });
    if (event) this.events.emit('exam.seating.published', event);
    return this.get(tenant, planId);
  }

  forSession(tenant: Tenant, sessionId: string): Promise<SeatingPlanDto[]> {
    return this.tx(tenant, async (tx) => {
      const session = await tx.examSession.findFirst({
        where: { id: sessionId, exam: { deletedAt: null } },
      });
      if (!session) throw new NotFoundException(NO_SESSION);
      const plans = await tx.seatingPlan.findMany({
        where: { sessionId },
        include: { _count: { select: { seats: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return Promise.all(plans.map((p) => this.dto(tx, p, p._count.seats)));
    });
  }

  get(tenant: Tenant, planId: string): Promise<SeatingPlanDto> {
    return this.tx(tenant, async (tx) => {
      const plan = await tx.seatingPlan.findFirst({
        where: { id: planId, session: { exam: { deletedAt: null } } },
        include: { _count: { select: { seats: true } } },
      });
      if (!plan) throw new NotFoundException(NO_PLAN);
      return this.dto(tx, plan, plan._count.seats);
    });
  }

  private async dto(tx: TxClient, plan: SeatingPlan, seated: number): Promise<SeatingPlanDto> {
    const stored = plan.halls as unknown as StoredHall[];
    const problems = plan.problems as unknown as Partial<StoredSeatingProblems>;
    const papers = new Map(
      (
        await tx.examPaper.findMany({
          where: { sessionId: plan.sessionId },
          include: { course: { select: { code: true } } },
        })
      ).map((p) => [p.id, p.course.code]),
    );
    const duties = await tx.invigilationDuty.findMany({
      where: { planId: plan.id },
      orderBy: { facultyName: 'asc' },
    });
    const halls: SeatingHallDto[] = stored
      .filter((h) => h.used > 0 || h.invigilatorIds.length > 0)
      .map((h) => ({
        hallId: h.hallId,
        code: h.code,
        capacity: h.capacity,
        used: h.used,
        reserved: h.reserved,
        papers: h.paperIds.map((id) => papers.get(id) ?? '(removed paper)').sort(),
        invigilators: duties.filter((d) => d.hallId === h.hallId).map((d) => d.facultyName),
      }));
    return {
      id: plan.id,
      sessionId: plan.sessionId,
      status: plan.status,
      solverStatus: plan.solverStatus,
      error: plan.error,
      seated,
      halls,
      unseated: problems.unseated ?? [],
      invigilationProblems: problems.invigilationProblems ?? [],
      createdAt: plan.createdAt.toISOString(),
      publishedAt: plan.publishedAt?.toISOString() ?? null,
    };
  }
}
