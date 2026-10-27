import { Controller, Get, Query } from '@nestjs/common';
import type { TodayV1 } from '@slotwise/shared/contracts';
import { PortalDateQuery, type PortalWeekV1 } from '@slotwise/shared/portal';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import { FeatureFlag } from '../common/feature-flag';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PortalService } from './portal.service';

/**
 * `GET /portal/today[?date=]` (portal-read.v1) and `GET /portal/week[?date=]`: the signed-in
 * student's or teacher's own classes. Who they are comes from their sign-in, never a parameter.
 */
@Controller('portal')
@FeatureFlag('P5')
export class PortalController {
  constructor(private readonly service: PortalService) {}

  @Get('today')
  @RequirePermission('timetable.view')
  today(
    @CurrentTenant() tenant: Tenant,
    @Query(new ZodPipe(PortalDateQuery)) query: PortalDateQuery,
  ): Promise<TodayV1> {
    return this.service.today(tenant, query.date);
  }

  @Get('week')
  @RequirePermission('timetable.view')
  week(
    @CurrentTenant() tenant: Tenant,
    @Query(new ZodPipe(PortalDateQuery)) query: PortalDateQuery,
  ): Promise<PortalWeekV1> {
    return this.service.week(tenant, query.date);
  }
}
