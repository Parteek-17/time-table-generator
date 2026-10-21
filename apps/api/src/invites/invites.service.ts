import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Institute, Invite } from '@slotwise/db';
import {
  can,
  type CreateInviteInput,
  type CreateInviteResponse,
  type InviteDto,
  type InvitePreviewDto,
  type MembershipDto,
  type ScopeDto,
} from '@slotwise/shared';
import { AuditService } from '../audit/audit.service';
import type { Tenant } from '../common/request-context';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../db/prisma.service';
import { MailService } from '../mail/mail.service';
import { inviteEmail } from '../mail/templates';
import { scopedResource, scopeNamer } from '../tenancy/scopes';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function inviteStatus(invite: Invite, now = new Date()): InvitePreviewDto['status'] {
  if (invite.acceptedAt) return 'accepted';
  if (invite.cancelledAt) return 'cancelled';
  if (invite.expiresAt <= now) return 'expired';
  return 'pending';
}

function toInviteDto(invite: Invite, scope: ScopeDto): InviteDto {
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    scope,
    expiresAt: invite.expiresAt.toISOString(),
    acceptedAt: invite.acceptedAt?.toISOString() ?? null,
    createdAt: invite.createdAt.toISOString(),
  };
}

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  acceptUrl(institute: Institute, token: string): string {
    return `${this.env.WEB_URL_TEMPLATE.replace('{slug}', institute.slug)}/invite/${token}`;
  }

  async create(tenant: Tenant, input: CreateInviteInput): Promise<CreateInviteResponse> {
    const { institute, authUser, user } = tenant;
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.env.INVITE_TTL_DAYS * 86_400_000);

    const { invite, scope } = await this.prisma.tenant(
      { instituteId: institute.id, userId: user.id },
      async (tx) => {
        let scopeId: string;
        if (input.scopeType === 'department') {
          const dept = await tx.department.findFirst({
            where: { id: input.departmentId, deletedAt: null },
          });
          if (!dept) throw new NotFoundException('We could not find that department.');
          scopeId = dept.id;
        } else {
          scopeId = institute.id;
        }

        const target = { scopeType: input.scopeType, scopeId, role: input.role };
        if (!can(authUser, 'member.invite', scopedResource('invite', institute, target))) {
          throw new ForbiddenException('You can’t give this role here.');
        }

        const alreadyMember = await tx.membership.findFirst({
          where: {
            instituteId: institute.id,
            revokedAt: null,
            role: input.role,
            scopeType: input.scopeType,
            scopeId,
            user: { email: input.email },
          },
        });
        if (alreadyMember) throw new ConflictException(`${input.email} already has this role.`);

        // A new invite replaces any earlier pending one for the same person and role.
        await tx.invite.updateMany({
          where: {
            email: input.email,
            role: input.role,
            scopeType: input.scopeType,
            scopeId,
            acceptedAt: null,
            cancelledAt: null,
          },
          data: { cancelledAt: new Date() },
        });

        const created = await tx.invite.create({
          data: {
            instituteId: institute.id,
            email: input.email,
            role: input.role,
            scopeType: input.scopeType,
            scopeId,
            tokenHash: hashToken(token),
            expiresAt,
            invitedById: user.id,
          },
        });
        await this.audit.record(tx, {
          instituteId: institute.id,
          actorUserId: user.id,
          action: 'invite.created',
          targetType: 'invite',
          targetId: created.id,
          metadata: { email: input.email, role: input.role, scopeType: input.scopeType, scopeId },
        });
        const name = await scopeNamer(tx, institute);
        return { invite: created, scope: name(input.scopeType, scopeId) };
      },
    );

    // Send after the transaction commits: a slow mail server must not hold a DB transaction.
    const acceptUrl = this.acceptUrl(institute, token);
    const emailSent = await this.mail.send(
      inviteEmail({
        to: invite.email,
        inviterName: user.name ?? user.email,
        instituteName: institute.name,
        role: invite.role,
        scopeName: scope.name,
        acceptUrl,
        expiresAt,
      }),
    );
    return { invite: toInviteDto(invite, scope), acceptUrl, emailSent };
  }

  /** Pending invites the caller could have sent. */
  listPending({ institute, authUser, user }: Tenant): Promise<InviteDto[]> {
    return this.prisma.tenant({ instituteId: institute.id, userId: user.id }, async (tx) => {
      const name = await scopeNamer(tx, institute);
      const rows = await tx.invite.findMany({
        where: { acceptedAt: null, cancelledAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });
      return rows
        .filter((i) => can(authUser, 'member.invite', scopedResource('invite', institute, i)))
        .map((i) => toInviteDto(i, name(i.scopeType, i.scopeId)));
    });
  }

  async cancel({ institute, authUser, user }: Tenant, inviteId: string): Promise<void> {
    await this.prisma.tenant({ instituteId: institute.id, userId: user.id }, async (tx) => {
      const invite = await tx.invite.findFirst({
        where: { id: inviteId, acceptedAt: null, cancelledAt: null },
      });
      if (!invite) throw new NotFoundException('This invite is no longer pending.');
      if (!can(authUser, 'member.invite', scopedResource('invite', institute, invite))) {
        throw new ForbiddenException('You can’t cancel this invite.');
      }
      await tx.invite.update({ where: { id: invite.id }, data: { cancelledAt: new Date() } });
      await this.audit.record(tx, {
        instituteId: institute.id,
        actorUserId: user.id,
        action: 'invite.cancelled',
        targetType: 'invite',
        targetId: invite.id,
        metadata: { email: invite.email, role: invite.role },
      });
    });
  }

  /** Public: what the invite is for, so the page can greet the person before sign-in. */
  async preview(institute: Institute, token: string): Promise<InvitePreviewDto> {
    return this.prisma.tenant({ instituteId: institute.id, userId: null }, async (tx) => {
      const invite = await tx.invite.findUnique({ where: { tokenHash: hashToken(token) } });
      if (!invite) throw new NotFoundException('This invite link is not valid.');
      const name = await scopeNamer(tx, institute);
      return {
        instituteName: institute.name,
        email: invite.email,
        role: invite.role,
        scope: name(invite.scopeType, invite.scopeId),
        status: inviteStatus(invite),
      };
    });
  }

  async accept({ institute, user }: Tenant, token: string): Promise<MembershipDto> {
    return this.prisma.tenant({ instituteId: institute.id, userId: user.id }, async (tx) => {
      const invite = await tx.invite.findUnique({ where: { tokenHash: hashToken(token) } });
      if (!invite) throw new NotFoundException('This invite link is not valid.');
      const status = inviteStatus(invite);
      if (status === 'accepted') throw new GoneException('This invite has already been used.');
      if (status === 'cancelled')
        throw new GoneException('This invite was cancelled. Ask for a new one.');
      if (status === 'expired')
        throw new GoneException('This invite has expired. Ask for a new one.');
      if (invite.email !== user.email.toLowerCase()) {
        throw new ForbiddenException(
          `This invite was sent to ${invite.email}. Sign in with that email to accept it.`,
        );
      }

      const existing = await tx.membership.findFirst({
        where: {
          userId: user.id,
          role: invite.role,
          scopeType: invite.scopeType,
          scopeId: invite.scopeId,
          revokedAt: null,
        },
      });
      const membership =
        existing ??
        (await tx.membership.create({
          data: {
            userId: user.id,
            role: invite.role,
            scopeType: invite.scopeType,
            scopeId: invite.scopeId,
            instituteId: institute.id,
            createdById: invite.invitedById,
          },
        }));
      await tx.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date(), acceptedById: user.id },
      });
      await this.audit.record(tx, {
        instituteId: institute.id,
        actorUserId: user.id,
        action: 'invite.accepted',
        targetType: 'invite',
        targetId: invite.id,
        metadata: { membershipId: membership.id, role: invite.role },
      });
      const name = await scopeNamer(tx, institute);
      return {
        id: membership.id,
        role: membership.role,
        scope: name(membership.scopeType, membership.scopeId),
      };
    });
  }
}
