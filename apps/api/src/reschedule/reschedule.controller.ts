import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { idParam } from '@slotwise/shared';
import {
  CancelClassInput,
  CancellationsQuery,
  CreateDisruptionInput,
  type CancellationDto,
  type CreateDisruptionResult,
  type DisruptionDto,
  type UndoDisruptionResult,
} from '@slotwise/shared/reschedule';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import { FeatureFlag } from '../common/feature-flag';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { CancellationsService } from './cancellations.service';
import { DisruptionsService } from './disruptions.service';

const id = new ZodPipe(idParam);

/**
 * Holidays, events and cancelled classes.
 *   POST   /terms/:termId/disruptions      add a holiday, event or leave; cancels its classes
 *   GET    /terms/:termId/disruptions      the term's active ones
 *   DELETE /disruptions/:id                undo: gives the classes back
 *   POST   /terms/:termId/cancellations    cancel one class on one date
 *   GET    /terms/:termId/cancellations    cancelled classes (?from&to&sectionId|facultyId)
 *   DELETE /cancellations/:id              undo a class cancelled by hand
 * Changes need timetable.edit where they apply (checked with can() in the services); reading
 * is open to everyone who reads timetables, as cancelled classes are part of the timetable.
 */
@Controller()
@FeatureFlag('P4')
export class RescheduleController {
  constructor(
    private readonly disruptions: DisruptionsService,
    private readonly cancellations: CancellationsService,
  ) {}

  @Post('terms/:termId/disruptions')
  @RequirePermission('timetable.edit')
  create(
    @CurrentTenant() tenant: Tenant,
    @Param('termId', id) termId: string,
    @Body(new ZodPipe(CreateDisruptionInput)) input: CreateDisruptionInput,
  ): Promise<CreateDisruptionResult> {
    return this.disruptions.create(tenant, termId, input);
  }

  @Get('terms/:termId/disruptions')
  @RequirePermission('timetable.view')
  list(
    @CurrentTenant() tenant: Tenant,
    @Param('termId', id) termId: string,
  ): Promise<DisruptionDto[]> {
    return this.disruptions.list(tenant, termId);
  }

  @Delete('disruptions/:id')
  @RequirePermission('timetable.edit')
  undo(
    @CurrentTenant() tenant: Tenant,
    @Param('id', id) disruptionId: string,
  ): Promise<UndoDisruptionResult> {
    return this.disruptions.undo(tenant, disruptionId);
  }

  @Post('terms/:termId/cancellations')
  @RequirePermission('timetable.edit')
  cancel(
    @CurrentTenant() tenant: Tenant,
    @Param('termId', id) termId: string,
    @Body(new ZodPipe(CancelClassInput)) input: CancelClassInput,
  ): Promise<CancellationDto> {
    return this.cancellations.cancel(tenant, termId, input);
  }

  @Get('terms/:termId/cancellations')
  @RequirePermission('timetable.view')
  cancelled(
    @CurrentTenant() tenant: Tenant,
    @Param('termId', id) termId: string,
    @Query(new ZodPipe(CancellationsQuery)) query: CancellationsQuery,
  ): Promise<CancellationDto[]> {
    return this.cancellations.list(tenant, termId, query);
  }

  @Delete('cancellations/:id')
  @RequirePermission('timetable.edit')
  restore(
    @CurrentTenant() tenant: Tenant,
    @Param('id', id) cancellationId: string,
  ): Promise<{ restored: true }> {
    return this.cancellations.undo(tenant, cancellationId);
  }
}
