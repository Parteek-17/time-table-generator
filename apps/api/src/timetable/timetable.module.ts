import { Module } from '@nestjs/common';
import { SnapshotClient, SolverClient } from './jobs/clients';
import { SolveWorker } from './jobs/solve.worker';
import { loadTimetableConfig, TIMETABLE_CONFIG } from './timetable.config';
import { TimetableGenerateController } from './timetable-generate.controller';
import { TimetableGenerateService } from './timetable-generate.service';
import { TimetableHealthController } from './timetable-health.controller';
import { TimetableReadController } from './timetable-read.controller';
import { TimetableReadService } from './timetable-read.service';

/** Timetables: generation, editing, versions and publishing. Owned by P2T. */
@Module({
  controllers: [TimetableHealthController, TimetableReadController, TimetableGenerateController],
  providers: [
    { provide: TIMETABLE_CONFIG, useFactory: () => loadTimetableConfig() },
    SnapshotClient,
    SolverClient,
    SolveWorker,
    TimetableReadService,
    TimetableGenerateService,
  ],
})
export class TimetableModule {}
