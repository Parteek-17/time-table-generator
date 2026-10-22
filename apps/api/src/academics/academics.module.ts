import { Module } from '@nestjs/common';
import { crudController } from '../masterdata/crud.controller';
import { branches, courses, programmes, schemeVersions } from './academics.entities';

/** Programmes, branches, scheme versions and courses. */
@Module({
  controllers: [
    crudController(programmes),
    crudController(branches),
    crudController(schemeVersions),
    crudController(courses),
  ],
})
export class AcademicsModule {}
