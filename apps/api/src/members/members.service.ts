import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@slotwise/db';
import { can, type MemberDto } from '@slotwise/shared';
import { AuditService } from '../audit/audit.service';
import type { Tenant } from '../common/request-context';
import { PrismaService } from '../db/prisma.service';
import { scopedResource, scopeNamer } from '../tenancy/scopes';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Active members the caller may see (a hod sees their own department). */
  list({ institute, authUser, user }: Tenant): Promise<MemberDto[]> {
    return this.prisma.tenant({ instituteId: institute.id, userId: user.id }, async (tx) => {
      const name = await scopeNamer(tx, institute);
      const rows = await tx.membership.findMany({
        where: { instituteId: institute.id, revokedAt: null },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: [{ createdAt: 'asc' }],
      });
      return rows
        .filter((m) => can(authUser, 'member.view', scopedResource('membership', institute, m)))
        .map((m) => ({
          membershipId: m.id,
          user: m.user,
          role: m.role,
          scope: name(m.scopeType, m.scopeId),
          createdAt: m.createdAt.toISOString(),
          revokedAt: null,
        }));
    });
  }

  async revoke({ institute, authUser, user }: Tenant, membershipId: string): Promise<void> {
    await this.prisma.tenant({ instituteId: institute.id, userId: user.id }, async (tx) => {
      const m = await tx.membership.findFirst({
        where: { id: membershipId, instituteId: institute.id, revokedAt: null },
      });
      if (!m) throw new NotFoundException('This person no longer has this role.');
      if (!can(authUser, 'member.revoke', scopedResource('membership', institute, m))) {
        throw new ForbiddenException('You can’t remove this role.');
      }
      if (m.userId === user.id) {
        throw new BadRequestException('You can’t remove your own access. Ask another admin.');
      }
      await tx.membership.update({
        where: { id: m.id },
        data: { revokedAt: new Date(), revokedById: user.id },
      });
      await this.audit.record(tx, {
        instituteId: institute.id,
        actorUserId: user.id,
        action: 'membership.revoked',
        targetType: 'membership',
        targetId: m.id,
        metadata: { userId: m.userId, role: m.role, scopeType: m.scopeType, scopeId: m.scopeId },
      });
    });
  }

  /** Undo for revoke. */
  async restore({ institute, authUser, user }: Tenant, membershipId: string): Promise<void> {
    await this.prisma.tenant({ instituteId: institute.id, userId: user.id }, async (tx) => {
      const m = await tx.membership.findFirst({
        where: { id: membershipId, instituteId: institute.id, revokedAt: { not: null } },
      });
      if (!m) throw new NotFoundException('Nothing to undo.');
      if (!can(authUser, 'member.invite', scopedResource('membership', institute, m))) {
        throw new ForbiddenException('You can’t give this role.');
      }
      try {
        await tx.membership.update({
          where: { id: m.id },
          data: { revokedAt: null, revokedById: null },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('This person already has this role again.');
        }
        throw error;
      }
      await this.audit.record(tx, {
        instituteId: institute.id,
        actorUserId: user.id,
        action: 'membership.restored',
        targetType: 'membership',
        targetId: m.id,
        metadata: { userId: m.userId, role: m.role },
      });
    });
  }
}
