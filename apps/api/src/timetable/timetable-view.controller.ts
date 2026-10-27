import { Controller, Get, Param, Query } from '@nestjs/common';
import { idParam } from '@slotwise/shared';
import { TimetableViewQuery, type TimetableViewDto } from '@slotwise/shared/timetable';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import { FeatureFlag } from '../common/feature-flag';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { TimetableViewService, type ScopeChoice } from './timetable-view.service';

const id = new ZodPipe(idParam);

/**
 * The timetable screen's reads.
 *   GET /timetable/versions/:versionId/view?kind=&id=   a week (drafts: editors only)
 *   GET /terms/:termId/timetable/scopes                 timetable groups to generate for
 */
@Controller()
@FeatureFlag('P2T')
export class TimetableViewController {
  constructor(private readonly service: TimetableViewService) {}

  @Get('timetable/versions/:versionId/view')
  @RequirePermission('timetable.view')
  view(
    @CurrentTenant() tenant: Tenant,
    @Param('versionId', id) versionId: string,
    @Query(new ZodPipe(TimetableViewQuery)) query: TimetableViewQuery,
  ): Promise<TimetableViewDto> {
    return this.service.view(tenant, versionId, query);
  }

  @Get('terms/:termId/timetable/scopes')
  @RequirePermission('timetable.edit')
  scopes(
    @CurrentTenant() tenant: Tenant,
    @Param('termId', id) termId: string,
  ): Promise<ScopeChoice[]> {
    return this.service.scopes(tenant, termId);
  }
}
