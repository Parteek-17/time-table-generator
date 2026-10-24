import { Module } from '@nestjs/common';
import { InstituteProvisionerMock } from './provisioning.mock';
import { SampleDataListener } from './sample-data.listener';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';

/** Setup wizard progress, sample data (institute.created listener). */
@Module({
  controllers: [SetupController],
  providers: [SetupService, SampleDataListener, InstituteProvisionerMock],
})
export class SetupModule {}
