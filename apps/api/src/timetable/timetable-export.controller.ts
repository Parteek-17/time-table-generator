import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { idParam } from '@slotwise/shared';
import { TimetableExportQuery } from '@slotwise/shared/timetable';
import type { Response } from 'express';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import { FeatureFlag } from '../common/feature-flag';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { TimetableExportService } from './timetable-export.service';

const id = new ZodPipe(idParam);

/**
 * Downloads.
 *   GET /timetable/versions/:versionId/export?format=pdf|xlsx&kind=&id=
 *   One week, or every section / lab group / teacher / room when id is left out.
 */
@Controller('timetable/versions/:versionId')
@FeatureFlag('P2T')
export class TimetableExportController {
  constructor(private readonly service: TimetableExportService) {}

  @Get('export')
  @RequirePermission('timetable.view')
  async export(
    @CurrentTenant() tenant: Tenant,
    @Param('versionId', id) versionId: string,
    @Query(new ZodPipe(TimetableExportQuery)) query: TimetableExportQuery,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.service.export(tenant, versionId, query);
    res
      .status(200)
      .set({
        'content-type': file.contentType,
        'content-disposition': `attachment; filename="${file.filename}"`,
        'cache-control': 'no-store',
      })
      .send(file.body);
  }
}
