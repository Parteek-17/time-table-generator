import { Module } from '@nestjs/common';
import { crudController } from '../masterdata/crud.controller';
import { timetableScopes } from './scope.entities';
import { TeachingController } from './teaching.controller';
import { TeachingService } from './teaching.service';

/** Who teaches what (grid, subject mentors) and timetable scopes. */
@Module({
  controllers: [TeachingController, crudController(timetableScopes)],
  providers: [TeachingService],
})
export class TeachingModule {}
