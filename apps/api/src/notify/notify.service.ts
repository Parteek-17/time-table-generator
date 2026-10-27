import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { NotificationRequestV1, type NotificationRequestV1Input } from '@slotwise/shared/contracts';
import { emailRecipients } from '@slotwise/shared/reschedule';
import type { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../db/prisma.service';
import { MailService } from '../mail/mail.service';
import { QueueService } from '../queue/queue.service';
import { RecipientsSource } from './recipients.source';
import { hasTemplate, renderEmail } from './templates';

export const NOTIFY_QUEUE = 'p4.notify';

export interface NotifyJobData {
  request: NotificationRequestV1;
  /** Whose action caused it; recipients are looked up with their permissions. */
  actorUserId: string | null;
}

export interface DeliveryResult {
  sent: number;
  failed: number;
  /** Already sent for this idempotency key (repeat request or re-delivered job). */
  skipped: number;
}

/**
 * notify.v1: takes notification requests (from any stream's `notify.requested` and from P4's
 * own listeners), queues them, and sends email to each person once. Never sends inside the
 * request that caused it (CLAUDE.md: long work goes to a queue).
 */
@Injectable()
export class NotifyService implements OnModuleInit {
  private readonly logger = new Logger(NotifyService.name);
  private queue: Queue<NotifyJobData> | null = null;
  private started = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly mail: MailService,
    private readonly recipients: RecipientsSource,
  ) {}

  onModuleInit(): void {
    // Tests (and CI) start the worker only when something is enqueued.
    if (this.env.NODE_ENV !== 'test') this.start();
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    this.queue = this.queues.queue<NotifyJobData>(NOTIFY_QUEUE);
    this.queue.on('error', (e) => this.logger.error(`queue: ${e.message}`));
    const worker = this.queues.worker<NotifyJobData>(
      NOTIFY_QUEUE,
      async (job) => {
        const result = await this.deliver(job.data);
        // A failed send is retried by BullMQ (attempts below); sent ones are skipped then.
        if (result.failed > 0) throw new Error(`${result.failed} email(s) not sent`);
      },
      { concurrency: 2 },
    );
    worker.on('error', (e) => this.logger.error(`worker: ${e.message}`));
  }

  /**
   * Validates and queues a request. Same idempotency key = same job, so a repeated request is
   * dropped by the queue as well as by the delivery records. Unknown templates are refused
   * here, not silently later.
   */
  async request(input: NotificationRequestV1Input, actorUserId: string | null): Promise<boolean> {
    const request = NotificationRequestV1.parse(input);
    if (!hasTemplate(request.templateKey)) {
      this.logger.warn(`No email template "${request.templateKey}"; not sent.`);
      return false;
    }
    if (!request.channels.includes('email')) return false;
    this.start();
    const delay = request.sendAfter
      ? Math.max(0, new Date(request.sendAfter).getTime() - Date.now())
      : 0;
    await this.queue!.add(
      request.templateKey,
      { request, actorUserId },
      {
        // BullMQ ids may not contain ":"; the key usually does.
        jobId: createHash('sha256')
          .update(`${request.instituteId} ${request.idempotencyKey}`)
          .digest('hex'),
        delay,
        priority: request.priority === 'urgent' ? 1 : 5,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    );
    return true;
  }

  /** Sends one request's emails. Safe to run again: people already sent to are skipped. */
  async deliver({ request, actorUserId }: NotifyJobData): Promise<DeliveryResult> {
    const result: DeliveryResult = { sent: 0, failed: 0, skipped: 0 };
    const institute = await this.prisma.institute.findUnique({
      where: { id: request.instituteId },
    });
    if (!institute) return result;
    if (!actorUserId) {
      // recipients.v1 runs as a user; system-sent notices wait for a service identity (INT).
      this.logger.warn(`"${request.idempotencyKey}" has no user to look up recipients as.`);
      return result;
    }
    const people = emailRecipients(
      await this.recipients.resolve({
        instituteSlug: institute.slug,
        actorUserId,
        query: request.recipients,
      }),
    );
    const ctx = { instituteId: institute.id, userId: actorUserId };
    const done = await this.prisma.tenant(ctx, (tx) =>
      tx.notificationDelivery.findMany({
        where: { idempotencyKey: request.idempotencyKey, channel: 'email', status: 'sent' },
        select: { recipient: true },
      }),
    );
    const sentTo = new Set(done.map((d) => d.recipient.toLowerCase()));

    for (const person of people) {
      if (sentTo.has(person.email.toLowerCase())) {
        result.skipped += 1;
        continue;
      }
      const mail = renderEmail(request.templateKey, request.data, person, institute.name);
      if (!mail) continue;
      const ok = await this.mail.send(mail);
      await this.prisma.tenant(ctx, (tx) =>
        tx.notificationDelivery.upsert({
          where: {
            instituteId_idempotencyKey_channel_recipient: {
              instituteId: institute.id,
              idempotencyKey: request.idempotencyKey,
              channel: 'email',
              recipient: person.email.toLowerCase(),
            },
          },
          create: {
            instituteId: institute.id,
            idempotencyKey: request.idempotencyKey,
            templateKey: request.templateKey,
            channel: 'email',
            recipient: person.email.toLowerCase(),
            userId: person.userId,
            status: ok ? 'sent' : 'failed',
          },
          update: { status: ok ? 'sent' : 'failed', attempts: { increment: 1 } },
        }),
      );
      if (ok) result.sent += 1;
      else result.failed += 1;
    }
    return result;
  }
}
