import { Module } from '@nestjs/common';
import { InstituteProvisioningController } from './institute-provisioning.controller';
import { InstituteProvisioningService } from './institute-provisioning.service';
import { PlatformAdminGuard } from './platform-admin.guard';

/**
 * institute-provisioning.v1: `POST /platform/institutes` and the service behind it, which P7's
 * sign-up and P1's sample institute import. Owned by INT.
 */
@Module({
  controllers: [InstituteProvisioningController],
  providers: [InstituteProvisioningService, PlatformAdminGuard],
  exports: [InstituteProvisioningService, PlatformAdminGuard],
})
export class InstituteProvisioningModule {}
