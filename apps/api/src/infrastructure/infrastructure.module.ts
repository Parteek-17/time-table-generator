import { Module } from '@nestjs/common';
import { crudController } from '../masterdata/crud.controller';
import { buildings, rooms } from './infrastructure.entities';

/** Buildings and rooms. */
@Module({ controllers: [crudController(buildings), crudController(rooms)] })
export class InfrastructureModule {}
