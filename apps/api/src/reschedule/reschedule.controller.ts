import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { idParam } from '@slotwise/shared';
import {
  BookMakeUpInput,
  CancelClassInput,
  CancellationsQuery,
  CoverageQuery,
  CreateDisruptionInput,
  type CancellationDto,
  type CoverageDto,
  type CreateDisruptionResult,
  type DisruptionDto,
  type MakeUpDto,
  type MakeUpOptionsDto,
  type RescheduleChoicesDto,
  type UndoDisruptionResult,
} from '@slotwise/shared/reschedule';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import { FeatureFlag } from '../common/feature-flag';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { CancellationsService } from './cancellations.service';
import { ChoicesService } from './choices.service';
import { CoverageService } from './coverage.service';
import { DisruptionsService } from './disruptions.service';
import { MakeUpsService } from './makeups.service';

const id = new ZodPipe(idParam);

/**
 * Holidays, events and cancelled classes.
 *   POST   /terms/:termId/disruptions      add a holiday, event or leave; cancels its classes
 *   GET    /terms/:termId/disruptions      the term's active ones
 *   DELETE /disruptions/:id                undo: gives the classes back
 *   POST   /terms/:termId/cancellations    cancel one class on one date
 *   GET    /terms/:termId/cancellations    cancelled classes (?from&to&sectionId|facultyId)
 *   DELETE /cancellations/:id              undo a class cancelled by hand
 *   GET    /cancellations/:id/make-up-options  free times and rooms, this week first
 *   POST   /cancellations/:id/make-up      book (or move) its make-up
 *   DELETE /make-ups/:id                   undo a make-up
 *   GET    /terms/:termId/coverage         syllabus coverage (?sectionId | departmentId)
 *   GET    /terms/:termId/reschedule/choices  sections and teachers for the forms
 * Changes need timetable.edit where they apply (checked with can() in the services); reading
 * is open to everyone who reads timetables, as cancelled classes are part of the timetable.
 */
@Controller()
@FeatureFlag('P4')
export class RescheduleController {
  constructor(
    private readonly disruptions: DisruptionsService,
    private readonly cancellations: CancellationsService,
    private readonly makeUps: MakeUpsService,
    private readonly coverageService: CoverageService,
    private readonly choicesService: ChoicesService,
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

  @Get('cancellations/:id/make-up-options')
  @RequirePermission('timetable.edit')
  makeUpOptions(
    @CurrentTenant() tenant: Tenant,
    @Param('id', id) cancellationId: string,
  ): Promise<MakeUpOptionsDto> {
    return this.makeUps.options(tenant, cancellationId);
  }

  @Post('cancellations/:id/make-up')
  @RequirePermission('timetable.edit')
  bookMakeUp(
    @CurrentTenant() tenant: Tenant,
    @Param('id', id) cancellationId: string,
    @Body(new ZodPipe(BookMakeUpInput)) input: BookMakeUpInput,
  ): Promise<MakeUpDto> {
    return this.makeUps.book(tenant, cancellationId, input);
  }

  @Delete('make-ups/:id')
  @RequirePermission('timetable.edit')
  removeMakeUp(
    @CurrentTenant() tenant: Tenant,
    @Param('id', id) makeUpId: string,
  ): Promise<{ removed: true }> {
    return this.makeUps.undo(tenant, makeUpId);
  }

  @Get('terms/:termId/coverage')
  @RequirePermission('timetable.view')
  coverage(
    @CurrentTenant() tenant: Tenant,
    @Param('termId', id) termId: string,
    @Query(new ZodPipe(CoverageQuery)) query: CoverageQuery,
  ): Promise<CoverageDto> {
    return this.coverageService.coverage(tenant, termId, query);
  }

  @Get('terms/:termId/reschedule/choices')
  @RequirePermission('timetable.edit')
  choices(
    @CurrentTenant() tenant: Tenant,
    @Param('termId', id) termId: string,
  ): Promise<RescheduleChoicesDto> {
    return this.choicesService.choices(tenant, termId);
  }
}
