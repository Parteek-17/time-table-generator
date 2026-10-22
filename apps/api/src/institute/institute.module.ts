import { Module } from '@nestjs/common';
import { departments } from '../academics/academics.entities';
import { crudController } from '../masterdata/crud.controller';
import { InstituteProfileController } from './institute.controller';

/** Institute profile, departments and the audit log. */
@Module({ controllers: [InstituteProfileController, crudController(departments)] })
export class InstituteModule {}
