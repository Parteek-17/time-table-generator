import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { idParam } from '@slotwise/shared';
import { BuildSeatingInput, type SeatingPlanDto } from '@slotwise/shared/exams';
import { CurrentTenant, RequirePermission } from '../../common/decorators';
import { FeatureFlag } from '../../common/feature-flag';
import type { Tenant } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { EXAM_MANAGE, EXAM_VIEW } from '../exam-permissions';
import { SeatingService } from './seating.service';

const id = new ZodPipe(idParam);

/**
 * Seating plans.
 *   POST /exams/sessions/:sessionId/seating   build a plan in the background (202, poll it)
 *   GET  /exams/sessions/:sessionId/seating   the session's plans, newest first
 *   GET  /exams/seating/:planId               one plan: status, halls, problems
 *   POST /exams/seating/:planId/publish       publish it (the earlier one is archived)
 */
@Controller('exams')
@FeatureFlag('P6')
export class SeatingController {
  constructor(private readonly service: SeatingService) {}

  @Post('sessions/:sessionId/seating')
  @HttpCode(202)
  @RequirePermission(EXAM_MANAGE)
  build(
    @CurrentTenant() tenant: Tenant,
    @Param('sessionId', id) sessionId: string,
    @Body(new ZodPipe(BuildSeatingInput)) body: BuildSeatingInput,
  ): Promise<{ planId: string }> {
    return this.service.build(tenant, sessionId, body);
  }

  @Get('sessions/:sessionId/seating')
  @RequirePermission(EXAM_VIEW)
  forSession(
    @CurrentTenant() tenant: Tenant,
    @Param('sessionId', id) sessionId: string,
  ): Promise<SeatingPlanDto[]> {
    return this.service.forSession(tenant, sessionId);
  }

  @Get('seating/:planId')
  @RequirePermission(EXAM_VIEW)
  get(
    @CurrentTenant() tenant: Tenant,
    @Param('planId', id) planId: string,
  ): Promise<SeatingPlanDto> {
    return this.service.get(tenant, planId);
  }

  @Post('seating/:planId/publish')
  @HttpCode(200)
  @RequirePermission(EXAM_MANAGE)
  publish(
    @CurrentTenant() tenant: Tenant,
    @Param('planId', id) planId: string,
  ): Promise<SeatingPlanDto> {
    return this.service.publish(tenant, planId);
  }
}
