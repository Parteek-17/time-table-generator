import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { idParam } from '@slotwise/shared';
import {
  GenerateTimetableInput,
  type SolveJobDto,
  type VersionSummaryDto,
} from '@slotwise/shared/timetable';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import { FeatureFlag } from '../common/feature-flag';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { TimetableGenerateService } from './timetable-generate.service';

const id = new ZodPipe(idParam);

/**
 * Generating timetables (a background job) and the versions editors see, drafts included.
 *   POST /terms/:termId/timetable/generate   → 202, the solve job to poll
 *   GET  /terms/:termId/timetable/jobs       recent solve jobs
 *   GET  /terms/:termId/timetable/versions   the term's versions (drafts for editors only)
 *   GET  /timetable/jobs/:jobId              one solve job (progress, outcome)
 */
@Controller()
@FeatureFlag('P2T')
export class TimetableGenerateController {
  constructor(private readonly service: TimetableGenerateService) {}

  @Post('terms/:termId/timetable/generate')
  @HttpCode(202)
  @RequirePermission('timetable.edit')
  generate(
    @CurrentTenant() tenant: Tenant,
    @Param('termId', id) termId: string,
    @Body(new ZodPipe(GenerateTimetableInput)) input: GenerateTimetableInput,
  ): Promise<SolveJobDto> {
    return this.service.generate(tenant, termId, input);
  }

  @Get('terms/:termId/timetable/jobs')
  @RequirePermission('timetable.edit')
  jobs(
    @CurrentTenant() tenant: Tenant,
    @Param('termId', id) termId: string,
  ): Promise<SolveJobDto[]> {
    return this.service.jobs(tenant, termId);
  }

  @Get('terms/:termId/timetable/versions')
  @RequirePermission('timetable.view')
  versions(
    @CurrentTenant() tenant: Tenant,
    @Param('termId', id) termId: string,
  ): Promise<VersionSummaryDto[]> {
    return this.service.versions(tenant, termId);
  }

  @Get('timetable/jobs/:jobId')
  @RequirePermission('timetable.edit')
  job(@CurrentTenant() tenant: Tenant, @Param('jobId', id) jobId: string): Promise<SolveJobDto> {
    return this.service.job(tenant, jobId);
  }
}
