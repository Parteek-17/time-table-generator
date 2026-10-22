import { Module } from '@nestjs/common';
import { RescheduleHealthController } from './reschedule-health.controller';

/** Rescheduling: disruptions, cancellations, make-ups and notifications. Owned by P4. */
@Module({ controllers: [RescheduleHealthController] })
export class RescheduleModule {}
