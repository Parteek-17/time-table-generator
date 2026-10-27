import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { canManagePlatform, type AuthUser } from '@slotwise/shared';
import type { AppRequest } from '../common/request-context';
import { PrismaService } from '../db/prisma.service';
import { toGrant } from '../tenancy/grants';

/**
 * For `/platform/*` routes (which also carry @SkipTenant()): loads the caller's platform
 * memberships and lets them through only if can() says they manage the platform.
 * Use with `@UseGuards(PlatformAdminGuard)`.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    const user = req.user;
    if (!user) throw new InternalServerErrorException('PlatformAdminGuard needs a signed-in route');
    // No institute: RLS still shows the caller their own memberships.
    const memberships = await this.prisma.tenant({ instituteId: null, userId: user.id }, (tx) =>
      tx.membership.findMany({
        where: { userId: user.id, scopeType: 'platform', revokedAt: null },
      }),
    );
    const authUser: AuthUser = { id: user.id, memberships: memberships.map(toGrant) };
    if (!canManagePlatform(authUser)) {
      throw new ForbiddenException('Only Slotwise platform admins can do this.');
    }
    return true;
  }
}
