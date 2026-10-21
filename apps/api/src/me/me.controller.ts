import { Controller, Get } from '@nestjs/common';
import type { InstituteDto, MeResponse } from '@slotwise/shared';
import { CurrentTenant } from '../common/decorators';
import type { Tenant } from '../common/request-context';
import { PrismaService } from '../db/prisma.service';
import { scopeNamer } from '../tenancy/scopes';

@Controller('me')
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  /** Who am I in this institute? 403 (from TenantGuard) if I don't belong here. */
  @Get()
  async me(@CurrentTenant() tenant: Tenant): Promise<MeResponse> {
    const { institute, user } = tenant;
    const rows = await this.prisma.tenant(
      { instituteId: institute.id, userId: user.id },
      async (tx) => {
        const name = await scopeNamer(tx, institute);
        const memberships = await tx.membership.findMany({
          where: {
            userId: user.id,
            revokedAt: null,
            OR: [
              { instituteId: institute.id },
              { scopeType: 'platform' },
              ...(institute.parentUniversityId
                ? [{ scopeType: 'university' as const, scopeId: institute.parentUniversityId }]
                : []),
            ],
          },
          orderBy: { createdAt: 'asc' },
        });
        return memberships.map((m) => ({
          id: m.id,
          role: m.role,
          scope: name(m.scopeType, m.scopeId),
        }));
      },
    );

    return {
      user,
      institute: toInstituteDto(institute),
      memberships: rows,
      grants: [...tenant.authUser.memberships],
    };
  }
}

export function toInstituteDto(i: Tenant['institute']): InstituteDto {
  return {
    id: i.id,
    name: i.name,
    slug: i.slug,
    type: i.type,
    timezone: i.timezone,
    parentUniversityId: i.parentUniversityId,
  };
}
