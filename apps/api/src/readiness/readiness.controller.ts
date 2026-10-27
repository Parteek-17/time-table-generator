import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { loadReadinessSnapshot } from '@slotwise/db';
import {
  idParam,
  readiness,
  readinessQuerySchema,
  type ReadinessDto,
  type ReadinessQuery,
} from '@slotwise/shared';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { MasterDataService } from '../masterdata/masterdata.service';

/**
 * "Ready to generate?" for a term, or for one timetable scope of it: the seven checks of
 * readiness() in packages/shared, each problem in plain words with the screen that fixes it.
 */
@Controller('terms')
export class ReadinessController {
  constructor(private readonly md: MasterDataService) {}

  @Get(':id/readiness')
  @RequirePermission('readiness.view')
  check(
    @CurrentTenant() tenant: Tenant,
    @Param('id', new ZodPipe(idParam)) termId: string,
    @Query(new ZodPipe(readinessQuerySchema)) query: ReadinessQuery,
  ): Promise<ReadinessDto> {
    return this.md.run(tenant, async ({ tx }) => {
      const scope = query.scopeId
        ? await tx.timetableScope.findFirst({
            where: { id: query.scopeId, termId, deletedAt: null },
            include: { cohorts: true },
          })
        : null;
      if (query.scopeId && !scope)
        throw new NotFoundException('We could not find this timetable scope in this term.');
      const snapshot = await loadReadinessSnapshot(tx, termId, {
        cohortIds: scope?.cohorts.map((c) => c.cohortId),
      });
      if (!snapshot.term) throw new NotFoundException('We could not find this term.');
      return {
        ...readiness(snapshot),
        term: { id: snapshot.term.id, label: snapshot.term.label },
        scope: scope ? { id: scope.id, name: scope.name } : null,
      };
    });
  }
}
