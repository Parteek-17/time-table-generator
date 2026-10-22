import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  cohortUpdateSchema,
  idParam,
  promoteSchema,
  sectionBulkSchema,
  type CohortRow,
  type CohortUpdateInput,
  type GenerateCohortsResultDto,
  type PromoteInput,
  type PromotePreviewDto,
  type PromoteResultDto,
  type SectionBulkInput,
  type SectionRow,
} from '@slotwise/shared';
import { z } from 'zod';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { CohortsService } from './cohorts.service';

const id = new ZodPipe(idParam);
const optionalTerm = new ZodPipe(z.uuid().optional());

@Controller()
export class CohortsController {
  constructor(private readonly cohorts: CohortsService) {}

  @Get('cohorts')
  @RequirePermission('masterdata.view')
  list(
    @CurrentTenant() tenant: Tenant,
    @Query('termId', optionalTerm) termId?: string,
  ): Promise<CohortRow[]> {
    return this.cohorts.list(tenant, termId);
  }

  @Get('cohorts/:id')
  @RequirePermission('masterdata.view')
  get(@CurrentTenant() tenant: Tenant, @Param('id', id) cohortId: string): Promise<CohortRow> {
    return this.cohorts.get(tenant, cohortId);
  }

  @Put('cohorts/:id')
  @RequirePermission('cohort.manage')
  update(
    @CurrentTenant() tenant: Tenant,
    @Param('id', id) cohortId: string,
    @Body(new ZodPipe(cohortUpdateSchema)) body: CohortUpdateInput,
  ): Promise<CohortRow> {
    return this.cohorts.update(tenant, cohortId, body);
  }

  @Post('cohorts/:id/sections')
  @RequirePermission('cohort.manage')
  addSections(
    @CurrentTenant() tenant: Tenant,
    @Param('id', id) cohortId: string,
    @Body(new ZodPipe(sectionBulkSchema)) body: SectionBulkInput,
  ): Promise<SectionRow[]> {
    return this.cohorts.addSections(tenant, cohortId, body);
  }

  @Post('terms/:id/cohorts/generate')
  @RequirePermission('term.manage')
  generate(
    @CurrentTenant() tenant: Tenant,
    @Param('id', id) termId: string,
  ): Promise<GenerateCohortsResultDto> {
    return this.cohorts.generate(tenant, termId);
  }

  @Get('terms/:id/promote')
  @RequirePermission('term.manage')
  preview(
    @CurrentTenant() tenant: Tenant,
    @Param('id', id) termId: string,
    @Query('toTermId', id) toTermId: string,
  ): Promise<PromotePreviewDto> {
    return this.cohorts.preview(tenant, termId, toTermId);
  }

  @Post('terms/:id/promote')
  @RequirePermission('term.manage')
  promote(
    @CurrentTenant() tenant: Tenant,
    @Param('id', id) termId: string,
    @Body(new ZodPipe(promoteSchema)) body: PromoteInput,
  ): Promise<PromoteResultDto> {
    return this.cohorts.promote(tenant, termId, body);
  }
}
