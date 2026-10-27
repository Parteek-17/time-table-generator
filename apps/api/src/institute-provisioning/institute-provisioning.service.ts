import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@slotwise/db';
import { RESERVED_SUBDOMAINS } from '@slotwise/shared';
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
import { MailService } from '../mail/mail.service';
import { inviteEmail } from '../mail/templates';

export interface ProvisionOptions {
  /** Platform admin who asked; null for the public sign-up, which acts as the platform. */
  actorUserId: string | null;
  /** Where the request came from, for the audit log. */
  via: 'platform' | 'signup' | 'sample';
  /**
   * The first admin is the signed-in caller ("Try with sample data"): give them the
   * membership straight away instead of emailing an invite.
   */
  grantNow?: boolean;
}

/** Thrown as `{ code, message }` (institute-provisioning.v1 PROVISIONING_ERRORS_V1). */
function refuse(status: 400 | 409, code: string, message: string, extra: object = {}): never {
  const body = { statusCode: status, code, message, ...extra };
  throw status === 409 ? new ConflictException(body) : new BadRequestException(body);
}

/**
 * Creates an institute and its first institute admin (institute-provisioning.v1) and emits
 * `institute.created`. Used by `POST /platform/institutes`, P7's sign-up and P1's sample
 * institute.
 */
@Injectable()
export class InstituteProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly events: EventEmitter2,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Validates the request; refusals use the contract's error codes. */
  parse(input: unknown): ProvisionInstituteRequestV1 {
    const result = ProvisionInstituteRequestV1.safeParse(input);
    if (result.success) return result.data;
    const slug = (input as { slug?: unknown } | null)?.slug;
    if (typeof slug === 'string' && RESERVED_SUBDOMAINS.includes(slug.toLowerCase())) {
      refuse(400, 'slug_reserved', `“${slug}” can’t be used as an address. Pick another one.`);
    }
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      (fieldErrors[issue.path.join('.') || '_'] ??= []).push(issue.message);
    }
    refuse(400, 'invalid_input', 'Please check the highlighted fields.', { fieldErrors });
  }

  async provision(
    input: ProvisionInstituteRequestV1Input,
    opts: ProvisionOptions,
  ): Promise<ProvisionInstituteResponseV1> {
    const req = this.parse(input);
    const slugTaken = () =>
      refuse(409, 'slug_taken', `${req.slug} is already taken. Try another address.`);
    if (
      await this.prisma.institute.findUnique({ where: { slug: req.slug }, select: { id: true } })
    ) {
      slugTaken();
    }

    const instituteId = randomUUID();
    const email = req.firstAdmin.email.toLowerCase();
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.env.INVITE_TTL_DAYS * 86_400_000);

    // One transaction: no institute without its first admin's invite. institutes and users
    // are global tables; the invite, membership and audit rows need the new institute's id.
    let result;
    try {
      result = await this.prisma.tenant({ instituteId, userId: opts.actorUserId }, async (tx) => {
        const institute = await tx.institute.create({
          data: {
            id: instituteId,
            name: req.name,
            slug: req.slug,
            type: req.type,
            timezone: req.timezone,
            affiliatingUniversityName: req.affiliatingUniversityName,
            isSample: req.withSampleData,
          },
        });
        const admin = await tx.user.upsert({
          where: { email },
          update: {},
          create: { email, name: req.firstAdmin.name },
        });
        const invite = await tx.invite.create({
          data: {
            instituteId,
            email,
            role: 'institute_admin',
            scopeType: 'institute',
            scopeId: instituteId,
            tokenHash: createHash('sha256').update(token).digest('hex'),
            expiresAt,
            // Self-serve sign-up: the person asked for it themselves.
            invitedById: opts.actorUserId ?? admin.id,
            ...(opts.grantNow ? { acceptedAt: now, acceptedById: admin.id } : {}),
          },
        });
        if (opts.grantNow) {
          await tx.membership.create({
            data: {
              userId: admin.id,
              role: 'institute_admin',
              scopeType: 'institute',
              scopeId: instituteId,
              instituteId,
              createdById: opts.actorUserId,
            },
          });
        }
        await this.audit.record(tx, {
          instituteId,
          actorUserId: opts.actorUserId,
          action: 'institute.created',
          targetType: 'institute',
          targetId: instituteId,
          metadata: {
            via: opts.via,
            withSampleData: req.withSampleData,
            planCode: req.planCode,
            firstAdminEmail: email,
          },
        });
        return { institute, admin, invite };
      });
    } catch (error) {
      // Two requests for the same slug at once: the unique index decides.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        slugTaken();
      }
      throw error;
    }
    const { institute, admin, invite } = result;
    const url = this.env.WEB_URL_TEMPLATE.replace('{slug}', institute.slug);

    // After commit: a slow mail server must not hold the transaction.
    if (!opts.grantNow) {
      await this.mail.send(
        inviteEmail({
          to: email,
          inviterName: 'Slotwise',
          instituteName: institute.name,
          role: 'institute_admin',
          scopeName: institute.name,
          acceptUrl: `${url}/invite/${token}`,
          expiresAt,
        }),
      );
    }

    this.events.emit(
      'institute.created',
      parseEvent('institute.created', {
        eventId: randomUUID(),
        occurredAt: now.toISOString(),
        instituteId,
        actorUserId: opts.actorUserId,
        slug: institute.slug,
        name: institute.name,
        firstAdminUserId: admin.id,
        withSampleData: req.withSampleData,
      }),
    );

    return ProvisionInstituteResponseV1.parse({
      version: INSTITUTE_PROVISIONING_V1,
      instituteId,
      slug: institute.slug,
      url,
      firstAdminUserId: admin.id,
      inviteId: invite.id,
      inviteExpiresAt: expiresAt.toISOString(),
    });
  }
}
