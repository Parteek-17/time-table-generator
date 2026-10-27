import { Module } from '@nestjs/common';
import { InstituteProvisioningModule } from '../institute-provisioning/institute-provisioning.module';
import { SignupController } from './signup.controller';
import { SignupService } from './signup.service';

/** Self-serve sign-up on institute-provisioning.v1. */
@Module({
  imports: [InstituteProvisioningModule],
  controllers: [SignupController],
  providers: [SignupService],
})
export class SignupModule {}
