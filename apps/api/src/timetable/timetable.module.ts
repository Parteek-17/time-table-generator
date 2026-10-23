import { Module } from '@nestjs/common';
import { TimetableHealthController } from './timetable-health.controller';
import { TimetableReadController } from './timetable-read.controller';
import { TimetableReadService } from './timetable-read.service';

/** Timetables: generation, editing, versions and publishing. Owned by P2T. */
@Module({
  controllers: [TimetableHealthController, TimetableReadController],
  providers: [TimetableReadService],
})
export class TimetableModule {}
