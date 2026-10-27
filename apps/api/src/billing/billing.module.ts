import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingListener } from './billing.listener';
import { BillingService } from './billing.service';

/** Plans, trials and limits. BillingService.assertCanAdd() is for other streams' create routes. */
@Module({
  controllers: [BillingController],
  providers: [BillingService, BillingListener],
  exports: [BillingService],
})
export class BillingModule {}
