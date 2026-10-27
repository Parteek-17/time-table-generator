import { randomBytes } from 'node:crypto';
import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import {
  setupStepSchema,
  setupStepUpdateSchema,
  type SampleInstituteDto,
  type SetupStateDto,
  type SetupStep,
  type SetupStepUpdateInput,
} from '@slotwise/shared';
import { InstituteProvisioningService } from '../institute-provisioning/institute-provisioning.service';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { MasterDataService } from '../masterdata/masterdata.service';
import { SetupService } from './setup.service';

/** Setup wizard progress and "Try with sample data". */
@Controller('setup')
export class SetupController {
  constructor(
    private readonly setup: SetupService,
    private readonly provisioning: InstituteProvisioningService,
    private readonly md: MasterDataService,
  ) {}

  @Get()
  @RequirePermission('masterdata.view')
  state(@CurrentTenant() tenant: Tenant): Promise<SetupStateDto> {
    return this.setup.state(tenant);
  }

  @Put('steps/:step')
  @RequirePermission('institute.manage')
  mark(
    @CurrentTenant() tenant: Tenant,
    @Param('step', new ZodPipe(setupStepSchema)) step: SetupStep,
    @Body(new ZodPipe(setupStepUpdateSchema)) body: SetupStepUpdateInput,
  ): Promise<SetupStateDto> {
    return this.setup.mark(tenant, step, body);
  }

  /**
   * Creates a separate institute filled with the fictional sample data, with the caller as its
   * admin. The data loads in the background (institute.created → P1's sample-data queue).
   */
  @Post('sample-institute')
  @RequirePermission('institute.manage')
  async sample(@CurrentTenant() tenant: Tenant): Promise<SampleInstituteDto> {
    this.md.assertCan(tenant, 'institute.manage', this.md.resource(tenant, 'institute', null));
    const base = tenant.institute.slug.slice(0, 40);
    const res = await this.provisioning.provision(
      {
        version: 'institute-provisioning.v1',
        name: 'Demo Institute of Engineering (sample)',
        slug: `${base}-sample-${randomBytes(3).toString('hex')}`,
        type: 'college',
        timezone: tenant.institute.timezone,
        affiliatingUniversityName: 'Demo Technical University',
        firstAdmin: { email: tenant.user.email, name: tenant.user.name ?? tenant.user.email },
        withSampleData: true,
      },
      { actorUserId: tenant.user.id, via: 'sample', grantNow: true },
    );
    await this.md.run(tenant, (ctx) =>
      this.md.audit(ctx, 'setup.sample_created', 'institute', res.instituteId, { slug: res.slug }),
    );
    return { slug: res.slug, url: res.url };
  }
}
