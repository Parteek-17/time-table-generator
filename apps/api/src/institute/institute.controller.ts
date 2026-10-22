import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import {
  canSomewhere,
  instituteProfileSchema,
  type AuditRow,
  type InstituteProfileDto,
  type InstituteProfileInput,
} from '@slotwise/shared';
import { z } from 'zod';
import { CurrentTenant, RequirePermission } from '../common/decorators';
import type { Tenant } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { changes } from '../masterdata/entity';
import { MasterDataService } from '../masterdata/masterdata.service';

/** Institute profile (wizard step 1) and the audit log. */
@Controller()
export class InstituteProfileController {
  constructor(private readonly md: MasterDataService) {}

  @Get('institute/profile')
  @RequirePermission('masterdata.view')
  get(@CurrentTenant() { institute }: Tenant): InstituteProfileDto {
    return {
      id: institute.id,
      slug: institute.slug,
      name: institute.name,
      type: institute.type,
      affiliatingUniversityName: institute.affiliatingUniversityName,
      timezone: institute.timezone,
    };
  }

  @Put('institute/profile')
  @RequirePermission('institute.manage')
  update(
    @CurrentTenant() tenant: Tenant,
    @Body(new ZodPipe(instituteProfileSchema)) body: InstituteProfileInput,
  ): Promise<InstituteProfileDto> {
    return this.md.run(tenant, async (ctx) => {
      this.md.assertCan(tenant, 'institute.manage', this.md.resource(tenant, 'institute', null));
      const before = this.get(tenant);
      // institutes is a global table (no RLS); update only the current institute by id.
      const row = await ctx.tx.institute.update({ where: { id: tenant.institute.id }, data: body });
      const after: InstituteProfileDto = { ...before, ...body, name: row.name };
      await this.md.audit(ctx, 'institute.updated', 'institute', row.id, {
        changes: JSON.parse(JSON.stringify(changes({ ...before }, { ...after }))),
      });
      return after;
    });
  }

  /**
   * Recent changes. Institute-wide readers of the audit log see everything; others (a hod)
   * see their own changes.
   */
  @Get('audit')
  @RequirePermission('audit.view')
  audit(
    @CurrentTenant() tenant: Tenant,
    @Query('limit', new ZodPipe(z.coerce.number().int().min(1).max(500).default(100)))
    limit: number,
  ): Promise<AuditRow[]> {
    const everything = canSomewhere(
      {
        id: tenant.user.id,
        memberships: tenant.authUser.memberships.filter((m) => m.scopeType !== 'department'),
      },
      'audit.view',
      tenant.institute,
    );
    return this.md.run(tenant, async ({ tx }) => {
      const rows = await tx.auditLog.findMany({
        where: everything ? {} : { actorUserId: tenant.user.id },
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return rows.map((r) => ({
        id: r.id,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        actor: r.actor,
        metadata: (r.metadata ?? {}) as Record<string, unknown>,
        createdAt: r.createdAt.toISOString(),
      }));
    });
  }
}
