import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  type Type,
} from '@nestjs/common';
import { idParam, listQuerySchema, type ListQuery } from '@slotwise/shared';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import type { BaseRow, EntityDef } from './entity';
import { MasterDataService } from './masterdata.service';

/**
 * Builds a controller with the standard routes for one entity:
 *   GET    /<path>              list (?includeArchived=1 and entity filters)
 *   GET    /<path>/:id
 *   POST   /<path>              create
 *   PUT    /<path>/:id          update (whole object)
 *   POST   /<path>/:id/archive  soft delete
 *   POST   /<path>/:id/restore  undo archive
 * Reads need masterdata.view; writes need def.manage somewhere, and the service checks the
 * exact row with can().
 */
export function crudController<I, R extends BaseRow, D>(def: EntityDef<I, R, D>): Type<unknown> {
  const body = new ZodPipe(def.schema);
  const id = new ZodPipe(idParam);

  @Controller(def.path)
  class CrudController {
    constructor(@Inject(MasterDataService) readonly service: MasterDataService) {}

    @Get()
    @RequirePermission('masterdata.view')
    list(
      @CurrentTenant() tenant: Tenant,
      @Query(new ZodPipe(listQuerySchema)) query: ListQuery,
    ): Promise<D[]> {
      return this.service.list(def, tenant, query);
    }

    @Get(':id')
    @RequirePermission('masterdata.view')
    get(@CurrentTenant() tenant: Tenant, @Param('id', id) rowId: string): Promise<D> {
      return this.service.get(def, tenant, rowId);
    }

    @Post()
    @RequirePermission(def.manage)
    create(@CurrentTenant() tenant: Tenant, @Body(body) input: I): Promise<D> {
      return this.service.create(def, tenant, input);
    }

    @Put(':id')
    @RequirePermission(def.manage)
    update(
      @CurrentTenant() tenant: Tenant,
      @Param('id', id) rowId: string,
      @Body(body) input: I,
    ): Promise<D> {
      return this.service.update(def, tenant, rowId, input);
    }

    @Post(':id/archive')
    @HttpCode(204)
    @RequirePermission(def.manage)
    archive(@CurrentTenant() tenant: Tenant, @Param('id', id) rowId: string): Promise<void> {
      return this.service.archive(def, tenant, rowId);
    }

    @Post(':id/restore')
    @RequirePermission(def.manage)
    restore(@CurrentTenant() tenant: Tenant, @Param('id', id) rowId: string): Promise<D> {
      return this.service.restore(def, tenant, rowId);
    }
  }

  // Distinct names make Nest's route logs and errors readable.
  Object.defineProperty(CrudController, 'name', { value: `${pascal(def.path)}Controller` });
  return CrudController;
}

function pascal(path: string): string {
  return path.replace(/(^|[-/])(\w)/g, (_, __, c: string) => c.toUpperCase());
}
