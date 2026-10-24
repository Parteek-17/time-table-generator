import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { idParam } from '@slotwise/shared';
import { EditInput, type EditorDataDto, type EditResult } from '@slotwise/shared/timetable';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import { FeatureFlag } from '../common/feature-flag';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { TimetableEditService } from './timetable-edit.service';

const id = new ZodPipe(idParam);

/**
 * Editing draft timetables.
 *   GET  /timetable/versions/:versionId/editor   snapshot, every slot, busy cells, not placed
 *   POST /timetable/versions/:versionId/edits    one move or lock (409 + reasons when refused)
 *   POST /timetable/versions/:versionId/copy     an editable draft copy of any version
 */
@Controller('timetable/versions/:versionId')
@FeatureFlag('P2T')
export class TimetableEditController {
  constructor(private readonly service: TimetableEditService) {}

  @Get('editor')
  @RequirePermission('timetable.edit')
  editor(
    @CurrentTenant() tenant: Tenant,
    @Param('versionId', id) versionId: string,
  ): Promise<EditorDataDto> {
    return this.service.editor(tenant, versionId);
  }

  @Post('edits')
  @HttpCode(200)
  @RequirePermission('timetable.edit')
  edit(
    @CurrentTenant() tenant: Tenant,
    @Param('versionId', id) versionId: string,
    @Body(new ZodPipe(EditInput)) input: EditInput,
  ): Promise<EditResult> {
    return this.service.edit(tenant, versionId, input);
  }

  @Post('copy')
  @RequirePermission('timetable.edit')
  copy(
    @CurrentTenant() tenant: Tenant,
    @Param('versionId', id) versionId: string,
  ): Promise<{ versionId: string }> {
    return this.service.copy(tenant, versionId);
  }
}
