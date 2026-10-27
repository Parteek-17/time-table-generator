import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  INSTITUTE_PROVISIONING_V1_ROUTE,
  type ProvisionInstituteRequestV1Input,
  type ProvisionInstituteResponseV1,
} from '@slotwise/shared/contracts';
import { CurrentUser, SkipTenant } from '../common/decorators';
import type { SignedInUser } from '../common/request-context';
import { InstituteProvisioningService } from './institute-provisioning.service';
import { PlatformAdminGuard } from './platform-admin.guard';

/** institute-provisioning.v1 for platform admins (P7's platform screens). */
@Controller(INSTITUTE_PROVISIONING_V1_ROUTE.slice(1))
@SkipTenant()
@UseGuards(PlatformAdminGuard)
export class InstituteProvisioningController {
  constructor(private readonly provisioning: InstituteProvisioningService) {}

  @Post()
  @HttpCode(201)
  create(
    // Validated by the service so refusals carry the contract's error codes.
    @Body() body: unknown,
    @CurrentUser() user: SignedInUser,
  ): Promise<ProvisionInstituteResponseV1> {
    return this.provisioning.provision(body as ProvisionInstituteRequestV1Input, {
      actorUserId: user.id,
      via: 'platform',
    });
  }
}
