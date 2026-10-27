import { Module } from '@nestjs/common';
import { CancellationsService } from './cancellations.service';
import { ChoicesService } from './choices.service';
import { CoverageService } from './coverage.service';
import { DisruptionsService } from './disruptions.service';
import { MakeUpsService } from './makeups.service';
import { loadRescheduleConfig, RESCHEDULE_CONFIG } from './reschedule.config';
import { RescheduleController } from './reschedule.controller';
import { RescheduleHealthController } from './reschedule-health.controller';
import { TermSource } from './term-source';

/** Rescheduling: disruptions, cancellations, make-ups and notifications. Owned by P4. */
@Module({
  controllers: [RescheduleHealthController, RescheduleController],
  providers: [
    { provide: RESCHEDULE_CONFIG, useFactory: () => loadRescheduleConfig() },
    TermSource,
    DisruptionsService,
    CancellationsService,
    MakeUpsService,
    CoverageService,
    ChoicesService,
  ],
})
export class RescheduleModule {}
