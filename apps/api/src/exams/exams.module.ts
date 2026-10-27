import { Module } from '@nestjs/common';
import { DateSheetController } from './date-sheet.controller';
import { DateSheetService } from './date-sheet.service';
import { ExamsHealthController } from './exams-health.controller';

/** Exam date sheets, seating plans and invigilation. Owned by P6. */
@Module({
  controllers: [ExamsHealthController, DateSheetController],
  providers: [DateSheetService],
})
export class ExamsModule {}
