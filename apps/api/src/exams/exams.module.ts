import { Module } from '@nestjs/common';
import { DateSheetController } from './date-sheet.controller';
import { DateSheetService } from './date-sheet.service';
import { ExamsHealthController } from './exams-health.controller';
import { SeatingController } from './seating/seating.controller';
import { SeatingService } from './seating/seating.service';
import { SeatingWorker } from './seating/seating.worker';
import { SeatingSolverClient } from './seating/solver.client';

/** Exam date sheets, seating plans and invigilation. Owned by P6. */
@Module({
  controllers: [ExamsHealthController, DateSheetController, SeatingController],
  providers: [DateSheetService, SeatingService, SeatingWorker, SeatingSolverClient],
})
export class ExamsModule {}
