import { Module } from '@nestjs/common';
import { SnapshotClient, SolverClient } from './jobs/clients';
import { SolveWorker } from './jobs/solve.worker';
import { loadTimetableConfig, TIMETABLE_CONFIG } from './timetable.config';
import { TimetableEditController } from './timetable-edit.controller';
import { TimetableEditService } from './timetable-edit.service';
import { TimetableExportController } from './timetable-export.controller';
import { TimetableExportService } from './timetable-export.service';
import { TimetableGenerateController } from './timetable-generate.controller';
import { TimetableGenerateService } from './timetable-generate.service';
import { TimetableHealthController } from './timetable-health.controller';
import { TimetablePublishController } from './timetable-publish.controller';
import { TimetablePublishService } from './timetable-publish.service';
import { TimetableReadController } from './timetable-read.controller';
import { TimetableReadService } from './timetable-read.service';
import { TimetableViewController } from './timetable-view.controller';
import { TimetableViewService } from './timetable-view.service';

/** Timetables: generation, editing, versions and publishing. Owned by P2T. */
@Module({
  controllers: [
    TimetableHealthController,
    TimetableReadController,
    TimetableGenerateController,
    TimetableViewController,
    TimetableEditController,
    TimetablePublishController,
    TimetableExportController,
  ],
  providers: [
    { provide: TIMETABLE_CONFIG, useFactory: () => loadTimetableConfig() },
    SnapshotClient,
    SolverClient,
    SolveWorker,
    TimetableReadService,
    TimetableGenerateService,
    TimetableViewService,
    TimetableEditService,
    TimetablePublishService,
    TimetableExportService,
  ],
})
export class TimetableModule {}
