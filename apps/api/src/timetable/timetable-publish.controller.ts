import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { idParam } from '@slotwise/shared';
import type { PublishResult, UndoPublishResult } from '@slotwise/shared/timetable';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import { FeatureFlag } from '../common/feature-flag';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { TimetablePublishService } from './timetable-publish.service';

const id = new ZodPipe(idParam);

/**
 * Publishing timetables.
 *   POST /timetable/versions/:versionId/publish        draft → published (the old one archived)
 *   POST /timetable/versions/:versionId/undo-publish   back to the previous version; the undone
 *                                                      classes come back as a new draft
 */
@Controller('timetable/versions/:versionId')
@FeatureFlag('P2T')
export class TimetablePublishController {
  constructor(private readonly service: TimetablePublishService) {}

  @Post('publish')
  @HttpCode(200)
  @RequirePermission('timetable.publish')
  publish(
    @CurrentTenant() tenant: Tenant,
    @Param('versionId', id) versionId: string,
  ): Promise<PublishResult> {
    return this.service.publish(tenant, versionId);
  }

  @Post('undo-publish')
  @HttpCode(200)
  @RequirePermission('timetable.publish')
  undoPublish(
    @CurrentTenant() tenant: Tenant,
    @Param('versionId', id) versionId: string,
  ): Promise<UndoPublishResult> {
    return this.service.undoPublish(tenant, versionId);
  }
}
