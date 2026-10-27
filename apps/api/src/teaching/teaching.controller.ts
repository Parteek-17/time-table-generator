import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import {
  idParam,
  subjectMentorSchema,
  teachingCellSchema,
  type SubjectMentorInput,
  type TeachingCellInput,
  type TeachingCohortDto,
  type TeachingGridDto,
} from '@slotwise/shared';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { TeachingService } from './teaching.service';

const id = new ZodPipe(idParam);

/**
 *   GET /teaching?termId=            running cohorts and how many cells still need a teacher
 *   GET /teaching/:cohortId          the grid, with each teacher's load
 *   PUT /teaching/:cohortId/cells    set or clear one cell's teachers
 *   PUT /teaching/:cohortId/mentors  set or clear a course's subject mentor
 */
@Controller('teaching')
export class TeachingController {
  constructor(private readonly teaching: TeachingService) {}

  @Get()
  @RequirePermission('masterdata.view')
  overview(
    @CurrentTenant() tenant: Tenant,
    @Query('termId', id) termId: string,
  ): Promise<TeachingCohortDto[]> {
    return this.teaching.overview(tenant, termId);
  }

  @Get(':cohortId')
  @RequirePermission('masterdata.view')
  grid(
    @CurrentTenant() tenant: Tenant,
    @Param('cohortId', id) cohortId: string,
  ): Promise<TeachingGridDto> {
    return this.teaching.grid(tenant, cohortId);
  }

  @Put(':cohortId/cells')
  @RequirePermission('teaching.manage')
  setCell(
    @CurrentTenant() tenant: Tenant,
    @Param('cohortId', id) cohortId: string,
    @Body(new ZodPipe(teachingCellSchema)) input: TeachingCellInput,
  ): Promise<TeachingGridDto> {
    return this.teaching.setCell(tenant, cohortId, input);
  }

  @Put(':cohortId/mentors')
  @RequirePermission('teaching.manage')
  setMentor(
    @CurrentTenant() tenant: Tenant,
    @Param('cohortId', id) cohortId: string,
    @Body(new ZodPipe(subjectMentorSchema)) input: SubjectMentorInput,
  ): Promise<TeachingGridDto> {
    return this.teaching.setMentor(tenant, cohortId, input);
  }
}
