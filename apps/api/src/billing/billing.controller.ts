import { Controller, Get } from '@nestjs/common';
import type { PlanStatusDto } from '@slotwise/shared/platform';
import { FeatureFlag } from '../common/feature-flag';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import type { Tenant } from '../common/request-context';
import { MasterDataService } from '../masterdata/masterdata.service';
import { PrismaService } from '../db/prisma.service';
import { BillingService } from './billing.service';

/** The institute's own plan, trial and usage, for its admins. */
@Controller('billing')
@FeatureFlag('P7')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly prisma: PrismaService,
    private readonly md: MasterDataService,
  ) {}

  @Get('plan')
  @RequirePermission('institute.manage')
  plan(@CurrentTenant() tenant: Tenant): Promise<PlanStatusDto> {
    this.md.assertCan(tenant, 'institute.manage', this.md.resource(tenant, 'institute', null));
    const { institute, user } = tenant;
    return this.prisma.tenant({ instituteId: institute.id, userId: user.id }, (tx) =>
      this.billing.status(tx, institute),
    );
  }
}
