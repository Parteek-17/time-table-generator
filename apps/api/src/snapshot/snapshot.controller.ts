import { Controller, Get, Param, Query } from '@nestjs/common';
import { idParam } from '@slotwise/shared';
import type { SetupSnapshotV1 } from '@slotwise/shared/contracts';
import { z } from 'zod';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { SnapshotService } from './snapshot.service';

/**
 * `GET /terms/:termId/snapshot[?scopeId=]` → `setup-snapshot.v1` (CONTRACTS.md #1).
 * Consumers: P2T (solver input), P2E.
 */
@Controller('terms')
export class SnapshotController {
  constructor(private readonly snapshots: SnapshotService) {}

  @Get(':termId/snapshot')
  @RequirePermission('masterdata.view')
  get(
    @CurrentTenant() tenant: Tenant,
    @Param('termId', new ZodPipe(idParam)) termId: string,
    @Query('scopeId', new ZodPipe(z.uuid().optional())) scopeId?: string,
  ): Promise<SetupSnapshotV1> {
    return this.snapshots.build(tenant, termId, scopeId);
  }
}
