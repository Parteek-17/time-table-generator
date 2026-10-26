import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  PayloadTooLargeException,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  IMPORT_KINDS,
  IMPORT_MAX_BYTES,
  idParam,
  importCreateSchema,
  importMappingSchema,
  importRowEditSchema,
  importRowsQuerySchema,
  type ImportCreateInput,
  type ImportJobDto,
  type ImportKindName,
  type ImportMappingInput,
  type ImportRowDto,
  type ImportRowEditInput,
  type ImportRowsPageDto,
  type ImportRowsQuery,
  type ImportTemplateFileDto,
} from '@slotwise/shared';
import { z } from 'zod';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import type { AppRequest, Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { ImportsService } from './imports.service';

const kindParam = z.enum(IMPORT_KINDS, { error: 'Unknown kind of import.' });

/**
 * The uploaded file is the raw request body (Content-Type application/octet-stream), so it
 * is not limited by the JSON body size. Read here with our own limit.
 */
async function fileBody(req: AppRequest): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return req.body;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > IMPORT_MAX_BYTES) {
      throw new PayloadTooLargeException('The file is too big. Keep it under 5 MB.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Excel/CSV import of master data (ADR 0011). */
@Controller('imports')
@RequirePermission('import.run')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get('templates/:kind')
  template(
    @Param('kind', new ZodPipe(kindParam)) kind: ImportKindName,
  ): Promise<ImportTemplateFileDto> {
    return this.imports.template(kind);
  }

  @Get()
  list(@CurrentTenant() tenant: Tenant): Promise<ImportJobDto[]> {
    return this.imports.list(tenant);
  }

  /** POST /imports?kind=faculty&fileName=staff.xlsx[&termId=] with the file as the body. */
  @Post()
  async create(
    @CurrentTenant() tenant: Tenant,
    @Query(new ZodPipe(importCreateSchema)) query: ImportCreateInput,
    @Req() req: AppRequest,
  ): Promise<ImportJobDto> {
    return this.imports.create(tenant, query, await fileBody(req));
  }

  @Get(':id')
  get(
    @CurrentTenant() tenant: Tenant,
    @Param('id', new ZodPipe(idParam)) id: string,
  ): Promise<ImportJobDto> {
    return this.imports.get(tenant, id);
  }

  @Get(':id/rows')
  rows(
    @CurrentTenant() tenant: Tenant,
    @Param('id', new ZodPipe(idParam)) id: string,
    @Query(new ZodPipe(importRowsQuerySchema)) query: ImportRowsQuery,
  ): Promise<ImportRowsPageDto> {
    return this.imports.rows(tenant, id, query);
  }

  @Put(':id/mapping')
  mapping(
    @CurrentTenant() tenant: Tenant,
    @Param('id', new ZodPipe(idParam)) id: string,
    @Body(new ZodPipe(importMappingSchema)) body: ImportMappingInput,
  ): Promise<ImportJobDto> {
    return this.imports.setMapping(tenant, id, body);
  }

  @Put(':id/rows/:rowNumber')
  editRow(
    @CurrentTenant() tenant: Tenant,
    @Param('id', new ZodPipe(idParam)) id: string,
    @Param('rowNumber', ParseIntPipe) rowNumber: number,
    @Body(new ZodPipe(importRowEditSchema)) body: ImportRowEditInput,
  ): Promise<ImportRowDto> {
    return this.imports.editRow(tenant, id, rowNumber, body);
  }

  @Post(':id/commit')
  commit(
    @CurrentTenant() tenant: Tenant,
    @Param('id', new ZodPipe(idParam)) id: string,
  ): Promise<ImportJobDto> {
    return this.imports.commit(tenant, id);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentTenant() tenant: Tenant,
    @Param('id', new ZodPipe(idParam)) id: string,
  ): Promise<ImportJobDto> {
    return this.imports.cancel(tenant, id);
  }
}
