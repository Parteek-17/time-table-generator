/**
 * MOCK of INT's institute provisioning (institute-provisioning.v1, `POST /platform/institutes`,
 * apps/api/src/institute-provisioning), used only by "Try with sample data" until INT's
 * service is on `main`. Then replace this file with a call to INT's service and delete it.
 *
 * Follows the contract's request and response and emits the real `institute.created` event.
 * Differences from the real thing: the first admin gets their membership straight away (the
 * invite row is created already accepted) because they are the signed-in user asking for it,
 * and it refuses to run in production.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  INSTITUTE_PROVISIONING_V1,
  ProvisionInstituteRequestV1,
  ProvisionInstituteResponseV1,
  parseEvent,
  type ProvisionInstituteRequestV1Input,
} from '@slotwise/shared/contracts';
import { AuditService } from '../audit/audit.service';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../db/prisma.service';

@Injectable()
export class InstituteProvisionerMock {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async provision(
    input: ProvisionInstituteRequestV1Input,
    actorUserId: string,
  ): Promise<ProvisionInstituteResponseV1> {
    if (this.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Sample institutes are not available here yet.');
    }
    const req = ProvisionInstituteRequestV1.parse(input);
    // institutes and users are global tables (no row-level security).
    const institute = await this.prisma.institute.create({
      data: {
        name: req.name,
        slug: req.slug,
        type: req.type,
        timezone: req.timezone,
        affiliatingUniversityName: req.affiliatingUniversityName,
        isSample: req.withSampleData,
      },
    });
    const email = req.firstAdmin.email.toLowerCase();
    const admin = await this.prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name: req.firstAdmin.name },
    });
    const expiresAt = new Date(Date.now() + 7 * 86_400_000);
    const invite = await this.prisma.tenant(
      { instituteId: institute.id, userId: actorUserId },
      async (tx) => {
        const row = await tx.invite.create({
          data: {
            instituteId: institute.id,
            email,
            role: 'institute_admin',
            scopeType: 'institute',
            scopeId: institute.id,
            tokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
            expiresAt,
            acceptedAt: new Date(),
            acceptedById: admin.id,
            invitedById: actorUserId,
          },
        });
        await tx.membership.create({
          data: {
            userId: admin.id,
            role: 'institute_admin',
            scopeType: 'institute',
            scopeId: institute.id,
            instituteId: institute.id,
            createdById: actorUserId,
          },
        });
        await this.audit.record(tx, {
          instituteId: institute.id,
          actorUserId,
          action: 'institute.created',
          targetType: 'institute',
          targetId: institute.id,
          metadata: { withSampleData: req.withSampleData, via: 'provisioning.mock' },
        });
        return row;
      },
    );

    this.events.emit(
      'institute.created',
      parseEvent('institute.created', {
        eventId: randomUUID(),
        occurredAt: new Date().toISOString(),
        instituteId: institute.id,
        actorUserId,
        slug: institute.slug,
        name: institute.name,
        firstAdminUserId: admin.id,
        withSampleData: req.withSampleData,
      }),
    );

    return ProvisionInstituteResponseV1.parse({
      version: INSTITUTE_PROVISIONING_V1,
      instituteId: institute.id,
      slug: institute.slug,
      url: this.env.WEB_URL_TEMPLATE.replace('{slug}', institute.slug),
      firstAdminUserId: admin.id,
      inviteId: invite.id,
      inviteExpiresAt: expiresAt.toISOString(),
    });
  }
}
