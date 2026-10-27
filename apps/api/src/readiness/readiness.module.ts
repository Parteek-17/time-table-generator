import { Module } from '@nestjs/common';
import { ReadinessController } from './readiness.controller';

/** GET /terms/:id/readiness. */
@Module({ controllers: [ReadinessController] })
export class ReadinessModule {}
