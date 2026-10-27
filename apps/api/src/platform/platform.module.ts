import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { InstituteProvisioningModule } from '../institute-provisioning/institute-provisioning.module';
import { PlatformHealthController } from './platform-health.controller';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

/** Platform admin: institutes and their plans. Owned by P7. */
@Module({
  imports: [BillingModule, InstituteProvisioningModule],
  controllers: [PlatformHealthController, PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
