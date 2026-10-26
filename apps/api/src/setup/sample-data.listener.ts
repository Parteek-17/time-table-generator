import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { buildSampleInstitute } from '@slotwise/db';
import type { EventPayloadV1 } from '@slotwise/shared/contracts';
import type { Queue } from 'bullmq';
import { AuditService } from '../audit/audit.service';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../db/prisma.service';
import { QueueService } from '../queue/queue.service';

type InstituteCreated = EventPayloadV1<'institute.created'>;

export const SAMPLE_DATA_QUEUE = 'p1.sample-data';

/**
 * Loads the fictional sample institute's master data into a newly created institute when
 * `institute.created` says `withSampleData` (CONTRACTS.md events). The work runs on P1's own
 * queue, keyed on the event id, so a repeated event loads it once; a job also skips an
 * institute that already has master data.
 */
@Injectable()
export class SampleDataListener implements OnModuleInit {
  private readonly logger = new Logger(SampleDataListener.name);
  private queue: Queue<InstituteCreated> | null = null;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly queues: QueueService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    // Tests (and CI, which has no Redis) start the worker only when something is enqueued.
    if (this.env.NODE_ENV !== 'test') this.start();
  }

  private start(): Queue<InstituteCreated> {
    if (this.queue) return this.queue;
    this.queue = this.queues.queue<InstituteCreated>(SAMPLE_DATA_QUEUE);
    this.queue.on('error', (e) => this.logger.error(`queue: ${e.message}`));
    const worker = this.queues.worker<InstituteCreated>(SAMPLE_DATA_QUEUE, (job) =>
      this.load(job.data),
    );
    worker.on('error', (e) => this.logger.error(`worker: ${e.message}`));
    return this.queue;
  }

  @OnEvent('institute.created')
  async onInstituteCreated(event: InstituteCreated): Promise<void> {
    if (!event.withSampleData) return;
    await this.start().add('load', event, {
      jobId: event.eventId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    });
  }

  /** One transaction as the app role, with row-level security set to the new institute. */
  async load(event: InstituteCreated): Promise<'loaded' | 'skipped'> {
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.institute_id', ${event.instituteId}, true),
                                  set_config('app.user_id', ${event.actorUserId ?? ''}, true)`;
        if ((await tx.programme.count()) > 0) return 'skipped' as const;
        const summary = await buildSampleInstitute(tx, event.instituteId);
        await this.audit.record(tx, {
          instituteId: event.instituteId,
          actorUserId: event.actorUserId,
          action: 'sample.loaded',
          targetType: 'institute',
          targetId: event.instituteId,
          metadata: { eventId: event.eventId, ...summary },
        });
        return 'loaded' as const;
      },
      { timeout: 120_000 },
    );
    this.logger.log(`Sample data ${result} for ${event.slug}`);
    return result;
  }
}
