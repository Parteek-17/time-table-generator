import { Module } from '@nestjs/common';
import { ExamsHealthController } from './exams-health.controller';

/** Exam date sheets, seating plans and invigilation. Owned by P6. */
@Module({ controllers: [ExamsHealthController] })
export class ExamsModule {}
