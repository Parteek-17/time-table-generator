import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  belongsToInstitute,
  canSomewhere,
  INSTITUTE_SLUG_HEADER,
  isValidSlug,
  type Action,
  type AuthUser,
} from '@slotwise/shared';
import { ALLOW_NON_MEMBER, REQUIRED_PERMISSION, SKIP_TENANT } from '../common/decorators';
import type { AppRequest } from '../common/request-context';
import { PrismaService } from '../db/prisma.service';
import { toGrant } from './grants';

/**
 * Resolves the institute from the X-Institute-Slug header (set by the web proxy from the
 * subdomain), loads the caller's memberships, and returns 403 unless they belong to it.
 * Also enforces @RequirePermission() via canSomewhere().
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(SKIP_TENANT, targets)) return true;

    const req = context.switchToHttp().getRequest<AppRequest>();
    const slug = String(req.headers[INSTITUTE_SLUG_HEADER] ?? '').toLowerCase();
    if (!isValidSlug(slug)) {
      throw new BadRequestException('Open your institute’s own address, e.g. demo.slotwise.app.');
    }

    const institute = await this.prisma.institute.findFirst({ where: { slug, deletedAt: null } });
    if (!institute) throw new NotFoundException('We could not find this institute.');

    req.institute = institute;
    // Public routes (invite preview) only need the institute.
    if (!req.user) return true;

    const user = req.user;
    const memberships = await this.prisma.tenant(
      { instituteId: institute.id, userId: user.id },
      (tx) => tx.membership.findMany({ where: { userId: user.id, revokedAt: null } }),
    );
    const authUser: AuthUser = { id: user.id, memberships: memberships.map(toGrant) };
    req.tenant = { institute, authUser, user };

    const allowNonMember = this.reflector.getAllAndOverride<boolean>(ALLOW_NON_MEMBER, targets);
    if (!allowNonMember && !belongsToInstitute(authUser, institute)) {
      throw new ForbiddenException('You don’t have access to this institute.');
    }

    const required = this.reflector.getAllAndOverride<Action | undefined>(
      REQUIRED_PERMISSION,
      targets,
    );
    if (required && !canSomewhere(authUser, required, institute)) {
      throw new ForbiddenException('You don’t have permission to do this.');
    }
    return true;
  }
}
