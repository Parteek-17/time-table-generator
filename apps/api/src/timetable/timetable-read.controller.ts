import { Controller, Get, Param, Query } from '@nestjs/common';
import { idParam } from '@slotwise/shared';
import { TimetableReadQueryV1, type TimetableReadResponseV1 } from '@slotwise/shared/contracts';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import { FeatureFlag } from '../common/feature-flag';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { TimetableReadService } from './timetable-read.service';

/**
 * `GET /terms/:termId/timetable?sectionId|subGroupId|facultyId|roomId=[&versionId=]`
 * (timetable-read.v1, for P4, P5 and P6). Anyone in the institute may read published timetables.
 */
@Controller('terms/:termId/timetable')
@FeatureFlag('P2T')
export class TimetableReadController {
  constructor(private readonly service: TimetableReadService) {}

  @Get()
  @RequirePermission('timetable.view')
  read(
    @CurrentTenant() tenant: Tenant,
    @Param('termId', new ZodPipe(idParam)) termId: string,
    @Query(new ZodPipe(TimetableReadQueryV1)) query: TimetableReadQueryV1,
  ): Promise<TimetableReadResponseV1> {
    return this.service.read(tenant, termId, query);
  }
}
