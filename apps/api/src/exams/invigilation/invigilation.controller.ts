import { Body, Controller, Get, HttpCode, Param, Put } from '@nestjs/common';
import { idParam } from '@slotwise/shared';
import { SetUnavailableInput, type InvigilatorDto } from '@slotwise/shared/exams';
import { CurrentTenant, RequirePermission } from '../../common/decorators';
import { FeatureFlag } from '../../common/feature-flag';
import type { Tenant } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { EXAM_MANAGE, EXAM_VIEW } from '../exam-permissions';
import { InvigilationService } from './invigilation.service';

const id = new ZodPipe(idParam);

/**
 * Invigilators of an exam session.
 *   GET /exams/sessions/:sessionId/invigilators   faculty, availability, papers they teach, load
 *   PUT /exams/sessions/:sessionId/unavailable    who cannot invigilate this session
 * Duties themselves are given out with the seating plan (POST …/seating).
 */
@Controller('exams/sessions/:sessionId')
@FeatureFlag('P6')
export class InvigilationController {
  constructor(private readonly service: InvigilationService) {}

  @Get('invigilators')
  @RequirePermission(EXAM_VIEW)
  invigilators(
    @CurrentTenant() tenant: Tenant,
    @Param('sessionId', id) sessionId: string,
  ): Promise<InvigilatorDto[]> {
    return this.service.invigilators(tenant, sessionId);
  }

  @Put('unavailable')
  @HttpCode(204)
  @RequirePermission(EXAM_MANAGE)
  setUnavailable(
    @CurrentTenant() tenant: Tenant,
    @Param('sessionId', id) sessionId: string,
    @Body(new ZodPipe(SetUnavailableInput)) body: SetUnavailableInput,
  ): Promise<void> {
    return this.service.setUnavailable(tenant, sessionId, body);
  }
}
