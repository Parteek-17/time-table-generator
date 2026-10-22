import { Module } from '@nestjs/common';
import { crudController } from '../masterdata/crud.controller';
import { FacultyController } from './faculty.controller';
import { faculty } from './faculty.entities';

/** Faculty, their availability and load limits. */
@Module({ controllers: [FacultyController, crudController(faculty)] })
export class FacultyModule {}
