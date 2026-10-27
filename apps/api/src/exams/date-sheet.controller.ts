import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { idParam } from '@slotwise/shared';
import {
  CreateExamInput,
  ExamListQuery,
  ExamPaperInput,
  ExamSessionInput,
  UpdateExamInput,
  UpdateExamPaperInput,
  type DateSheetDto,
  type ExamSummaryDto,
} from '@slotwise/shared/exams';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import { FeatureFlag } from '../common/feature-flag';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { DateSheetService } from './date-sheet.service';
import { EXAM_MANAGE, EXAM_VIEW } from './exam-permissions';

const id = new ZodPipe(idParam);

/**
 * Exams and date sheets.
 *   GET    /exams[?termId=]                 exams of the institute (or of one term)
 *   POST   /exams                           new exam
 *   PATCH  /exams/:examId                   rename, seating settings
 *   DELETE /exams/:examId                   remove (soft)
 *   GET    /exams/:examId/date-sheet        sessions, papers and clashes
 *   POST   /exams/:examId/sessions          add a session (date + Morning/Evening)
 *   PATCH  /exams/sessions/:sessionId       change it
 *   DELETE /exams/sessions/:sessionId       remove it with its papers
 *   POST   /exams/:examId/papers            put a course on the date sheet
 *   PATCH  /exams/papers/:paperId           move it or change its sections
 *   DELETE /exams/papers/:paperId           take it off
 */
@Controller('exams')
@FeatureFlag('P6')
export class DateSheetController {
  constructor(private readonly service: DateSheetService) {}

  @Get()
  @RequirePermission(EXAM_VIEW)
  list(
    @CurrentTenant() tenant: Tenant,
    @Query(new ZodPipe(ExamListQuery)) query: ExamListQuery,
  ): Promise<ExamSummaryDto[]> {
    return this.service.list(tenant, query.termId);
  }

  @Post()
  @RequirePermission(EXAM_MANAGE)
  create(
    @CurrentTenant() tenant: Tenant,
    @Body(new ZodPipe(CreateExamInput)) body: CreateExamInput,
  ): Promise<ExamSummaryDto> {
    return this.service.create(tenant, body);
  }

  @Patch(':examId')
  @RequirePermission(EXAM_MANAGE)
  update(
    @CurrentTenant() tenant: Tenant,
    @Param('examId', id) examId: string,
    @Body(new ZodPipe(UpdateExamInput)) body: UpdateExamInput,
  ): Promise<ExamSummaryDto> {
    return this.service.update(tenant, examId, body);
  }

  @Delete(':examId')
  @HttpCode(204)
  @RequirePermission(EXAM_MANAGE)
  remove(@CurrentTenant() tenant: Tenant, @Param('examId', id) examId: string): Promise<void> {
    return this.service.remove(tenant, examId);
  }

  @Get(':examId/date-sheet')
  @RequirePermission(EXAM_VIEW)
  dateSheet(
    @CurrentTenant() tenant: Tenant,
    @Param('examId', id) examId: string,
  ): Promise<DateSheetDto> {
    return this.service.dateSheet(tenant, examId);
  }

  @Post(':examId/sessions')
  @RequirePermission(EXAM_MANAGE)
  addSession(
    @CurrentTenant() tenant: Tenant,
    @Param('examId', id) examId: string,
    @Body(new ZodPipe(ExamSessionInput)) body: ExamSessionInput,
  ): Promise<{ id: string }> {
    return this.service.addSession(tenant, examId, body);
  }

  @Patch('sessions/:sessionId')
  @HttpCode(204)
  @RequirePermission(EXAM_MANAGE)
  updateSession(
    @CurrentTenant() tenant: Tenant,
    @Param('sessionId', id) sessionId: string,
    @Body(new ZodPipe(ExamSessionInput)) body: ExamSessionInput,
  ): Promise<void> {
    return this.service.updateSession(tenant, sessionId, body);
  }

  @Delete('sessions/:sessionId')
  @HttpCode(204)
  @RequirePermission(EXAM_MANAGE)
  removeSession(
    @CurrentTenant() tenant: Tenant,
    @Param('sessionId', id) sessionId: string,
  ): Promise<void> {
    return this.service.removeSession(tenant, sessionId);
  }

  @Post(':examId/papers')
  @RequirePermission(EXAM_MANAGE)
  addPaper(
    @CurrentTenant() tenant: Tenant,
    @Param('examId', id) examId: string,
    @Body(new ZodPipe(ExamPaperInput)) body: ExamPaperInput,
  ): Promise<{ id: string }> {
    return this.service.addPaper(tenant, examId, body);
  }

  @Patch('papers/:paperId')
  @HttpCode(204)
  @RequirePermission(EXAM_MANAGE)
  updatePaper(
    @CurrentTenant() tenant: Tenant,
    @Param('paperId', id) paperId: string,
    @Body(new ZodPipe(UpdateExamPaperInput)) body: UpdateExamPaperInput,
  ): Promise<void> {
    return this.service.updatePaper(tenant, paperId, body);
  }

  @Delete('papers/:paperId')
  @HttpCode(204)
  @RequirePermission(EXAM_MANAGE)
  removePaper(
    @CurrentTenant() tenant: Tenant,
    @Param('paperId', id) paperId: string,
  ): Promise<void> {
    return this.service.removePaper(tenant, paperId);
  }
}
