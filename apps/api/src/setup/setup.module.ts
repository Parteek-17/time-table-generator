import { Module } from '@nestjs/common';
import { InstituteProvisioningModule } from '../institute-provisioning/institute-provisioning.module';
import { SampleDataListener } from './sample-data.listener';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';

/** Setup wizard progress, sample data (institute.created listener). */
@Module({
  imports: [InstituteProvisioningModule],
  controllers: [SetupController],
  providers: [SetupService, SampleDataListener],
})
export class SetupModule {}
