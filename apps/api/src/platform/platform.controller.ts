import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import {
  setPlanSchema,
  type PlatformInstituteDto,
  type SetPlanInput,
} from '@slotwise/shared/platform';
import { CurrentUser, SkipTenant } from '../common/decorators';
import { FeatureFlag } from '../common/feature-flag';
import type { SignedInUser } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PlatformAdminGuard } from '../institute-provisioning/platform-admin.guard';
import { PlatformService } from './platform.service';

/**
 * Platform admin screens: every institute and its plan. Creating one is INT's
 * `POST /platform/institutes` (institute-provisioning.v1).
 */
@Controller('platform/institutes')
@SkipTenant()
@FeatureFlag('P7')
@UseGuards(PlatformAdminGuard)
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get()
  list(@CurrentUser() user: SignedInUser, @Query('q') q?: string): Promise<PlatformInstituteDto[]> {
    return this.platform.list(user.id, typeof q === 'string' ? q : '');
  }

  @Put(':id/plan')
  setPlan(
    @CurrentUser() user: SignedInUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(setPlanSchema)) body: SetPlanInput,
  ): Promise<PlatformInstituteDto['plan']> {
    return this.platform.setPlan(user.id, id, body);
  }
}
