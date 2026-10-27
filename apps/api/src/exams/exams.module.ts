import { Module } from '@nestjs/common';
import { DateSheetController } from './date-sheet.controller';
import { DateSheetService } from './date-sheet.service';
import { ExamsHealthController } from './exams-health.controller';
import { ExamExportController } from './export/exam-export.controller';
import { ExamExportService } from './export/exam-export.service';
import { InvigilationController } from './invigilation/invigilation.controller';
import { InvigilationService } from './invigilation/invigilation.service';
import { MyExamsController } from './me/my-exams.controller';
import { MyExamsService } from './me/my-exams.service';
import { SeatingController } from './seating/seating.controller';
import { SeatingService } from './seating/seating.service';
import { SeatingWorker } from './seating/seating.worker';
import { SeatingSolverClient } from './seating/solver.client';

/** Exam date sheets, seating plans and invigilation. Owned by P6. */
@Module({
  controllers: [
    ExamsHealthController,
    DateSheetController,
    SeatingController,
    InvigilationController,
    ExamExportController,
    MyExamsController,
  ],
  providers: [
    DateSheetService,
    SeatingService,
    SeatingWorker,
    SeatingSolverClient,
    InvigilationService,
    ExamExportService,
    MyExamsService,
  ],
})
export class ExamsModule {}
