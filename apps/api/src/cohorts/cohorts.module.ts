import { Module } from '@nestjs/common';
import { crudController } from '../masterdata/crud.controller';
import { CohortsController } from './cohorts.controller';
import { batches, electiveSections, sections, students } from './cohorts.entities';
import { CohortsService } from './cohorts.service';

/** Batches, cohorts, sections and sub-groups, elective sections, students, promote. */
@Module({
  controllers: [
    CohortsController,
    crudController(batches),
    crudController(sections),
    crudController(electiveSections),
    crudController(students),
  ],
  providers: [CohortsService],
})
export class CohortsModule {}
