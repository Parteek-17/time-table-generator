import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { EventPayloadV1 } from '@slotwise/shared/contracts';
import { PrismaService } from '../db/prisma.service';
import { BillingService } from './billing.service';

/** Every new institute starts on the default plan (a free trial). */
@Injectable()
export class BillingListener {
  private readonly logger = new Logger(BillingListener.name);

  constructor(
    private readonly billing: BillingService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent('institute.created')
  async onInstituteCreated(event: EventPayloadV1<'institute.created'>): Promise<void> {
    try {
      // institutes is a global table.
      const institute = await this.prisma.institute.findUnique({
        where: { id: event.instituteId },
        select: { timezone: true },
      });
      if (!institute) return;
      await this.billing.startDefaultPlan(event.instituteId, institute.timezone);
    } catch (error) {
      // No row = default plan anyway (planOf), so a failure here only delays the trial date.
      this.logger.error(`plan for ${event.slug}: ${(error as Error).message}`);
    }
  }
}
