import { Module } from '@nestjs/common';
import { TimetableHealthController } from './timetable-health.controller';

/** Timetables: generation, editing, versions and publishing. Owned by P2T. */
@Module({ controllers: [TimetableHealthController] })
export class TimetableModule {}
