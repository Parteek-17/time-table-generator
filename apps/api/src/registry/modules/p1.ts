import type { Type } from '@nestjs/common';
import { AcademicsModule } from '../../academics/academics.module';
import { CalendarModule } from '../../calendar/calendar.module';
import { CohortsModule } from '../../cohorts/cohorts.module';
import { FacultyModule } from '../../faculty/faculty.module';
import { ImportsModule } from '../../imports/imports.module';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module';
import { InstituteModule } from '../../institute/institute.module';
import { SetupModule } from '../../setup/setup.module';
import { SnapshotModule } from '../../snapshot/snapshot.module';

/** P1's Nest modules (institute setup and master data). */
export const P1_MODULES: Type[] = [
  InstituteModule,
  AcademicsModule,
  CohortsModule,
  FacultyModule,
  InfrastructureModule,
  CalendarModule,
  SnapshotModule,
  SetupModule,
  ImportsModule,
];
