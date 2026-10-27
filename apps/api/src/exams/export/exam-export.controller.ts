import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { idParam } from '@slotwise/shared';
import { ExamExportQuery } from '@slotwise/shared/exams';
import type { Response } from 'express';
import { CurrentTenant, RequirePermission } from '../../common/decorators';
import { FeatureFlag } from '../../common/feature-flag';
import type { Tenant } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { EXAM_VIEW } from '../exam-permissions';
import { ExamExportService } from './exam-export.service';

const id = new ZodPipe(idParam);

/**
 * Downloads of a seating plan.
 *   GET /exams/seating/:planId/export?doc=hall-chart|notice|attendance|duties&format=pdf|xlsx
 */
@Controller('exams/seating/:planId')
@FeatureFlag('P6')
export class ExamExportController {
  constructor(private readonly service: ExamExportService) {}

  @Get('export')
  @RequirePermission(EXAM_VIEW)
  async export(
    @CurrentTenant() tenant: Tenant,
    @Param('planId', id) planId: string,
    @Query(new ZodPipe(ExamExportQuery)) query: ExamExportQuery,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.service.export(tenant, planId, query);
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
