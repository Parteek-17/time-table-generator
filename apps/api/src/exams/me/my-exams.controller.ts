import { Controller, Get } from '@nestjs/common';
import type { MyExamsDto } from '@slotwise/shared/exams';
import { CurrentTenant, RequirePermission } from '../../common/decorators';
import { FeatureFlag } from '../../common/feature-flag';
import type { Tenant } from '../../common/request-context';
import { MyExamsService } from './my-exams.service';

/**
 *   GET /exams/me   my exam seats (students) or invigilation duties (teachers), published only
 */
@Controller('exams/me')
@FeatureFlag('P6')
export class MyExamsController {
  constructor(private readonly service: MyExamsService) {}

  @Get()
  // Every member may ask; the service only ever returns the caller's own record.
  @RequirePermission('institute.view')
  me(@CurrentTenant() tenant: Tenant): Promise<MyExamsDto> {
    return this.service.me(tenant);
  }
}
