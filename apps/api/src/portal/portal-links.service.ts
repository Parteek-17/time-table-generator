import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Institute, TxClient } from '@slotwise/db';
import { belongsToInstitute, can, type AuthUser } from '@slotwise/shared';
import {
  linkId,
  linkToken,
  localNow,
  type CreatePublicLinkBody,
  type PortalFeedV1,
  type PublicLinksV1,
  type PublicLinkV1,
  type PublicTimetableV1,
} from '@slotwise/shared/portal';
import type { Tenant } from '../common/request-context';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../db/prisma.service';
import { toGrant } from '../tenancy/grants';
import { PortalViewerService } from './portal-viewer.service';
import { PortalService } from './portal.service';
import { PublishedTimetableClient } from './timetable.client';

const NOT_FOUND = 'This link doesn’t work any more. Ask for a new one.';
const NOT_ALLOWED =
  'You don’t have permission to share this timetable. Ask your timetable coordinator.';

/** Who may make a public link for a section (its department) or a room (institute-wide). */
function shareResource(instituteId: string, departmentId: string | null) {
  return { type: 'timetable' as const, instituteId, departmentId };
}

/**
 * Links that work without signing in (ADR 0071): each person's calendar feed, and public
 * read-only timetables of sections and rooms with QR codes. Tokens are signed row ids; a
 * row can be revoked.
 */
@Injectable()
export class PortalLinksService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly portal: PortalService,
    private readonly viewers: PortalViewerService,
    private readonly timetable: PublishedTimetableClient,
  ) {}

  private ctx(tenant: Tenant) {
    return { instituteId: tenant.institute.id, userId: tenant.user.id };
  }

  // ----- Calendar feed -------------------------------------------------------------------

  private feedDto(row: { id: string; createdAt: Date }): PortalFeedV1 {
    return {
      path: `/ical/${linkToken('ical', row.id, this.env.API_JWT_SECRET)}.ics`,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** The signed-in person's feed link, made on first use. */
  async myFeed(tenant: Tenant): Promise<PortalFeedV1> {
    return this.prisma.tenant(this.ctx(tenant), async (tx) => {
      const row =
        (await tx.portalCalendarFeed.findFirst({
          where: { userId: tenant.user.id, revokedAt: null },
          orderBy: { createdAt: 'desc' },
        })) ??
        (await tx.portalCalendarFeed.create({
          data: { instituteId: tenant.institute.id, userId: tenant.user.id },
        }));
      return this.feedDto(row);
    });
  }

  /** "Make a new link": the old one stops working at once. */
  async resetFeed(tenant: Tenant): Promise<PortalFeedV1> {
    return this.prisma.tenant(this.ctx(tenant), async (tx) => {
      await tx.portalCalendarFeed.updateMany({
        where: { userId: tenant.user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const row = await tx.portalCalendarFeed.create({
        data: { instituteId: tenant.institute.id, userId: tenant.user.id },
      });
      return this.feedDto(row);
    });
  }

  /** The `.ics` file for a feed token, read as its owner with their current memberships. */
  async feedFile(institute: Institute, token: string, now = new Date()): Promise<string> {
    const id = linkId('ical', token, this.env.API_JWT_SECRET);
    if (!id) throw new NotFoundException(NOT_FOUND);
    const owner = await this.prisma.tenant(
      { instituteId: institute.id, userId: null },
      async (tx) => {
        const feed = await tx.portalCalendarFeed.findFirst({
          where: { id, revokedAt: null },
          include: { user: { select: { id: true, email: true, name: true } } },
        });
        if (!feed) return null;
        const memberships = await tx.membership.findMany({
          where: { userId: feed.userId, revokedAt: null },
        });
        return { user: feed.user, memberships };
      },
    );
    if (!owner) throw new NotFoundException(NOT_FOUND);
    const authUser: AuthUser = { id: owner.user.id, memberships: owner.memberships.map(toGrant) };
    // Someone who left the institute gets nothing, the same as signing in would.
    if (!belongsToInstitute(authUser, institute)) throw new NotFoundException(NOT_FOUND);
    return this.portal.feed({ institute, authUser, user: owner.user }, now);
  }

  // ----- Public section / room links -----------------------------------------------------

  private linkDto(row: {
    id: string;
    kind: 'section' | 'room';
    targetId: string;
    label: string;
    createdAt: Date;
  }): PublicLinkV1 {
    return {
      id: row.id,
      kind: row.kind,
      targetId: row.targetId,
      label: row.label,
      path: `/p/${linkToken('public', row.id, this.env.API_JWT_SECRET)}`,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Sections of the current term and rooms this person may share, with their departments. */
  private async targets(tx: TxClient, tenant: Tenant) {
    const today = localNow(tenant.institute.timezone).date;
    const termId = await this.viewers.termOn(tx, today);
    const [sections, rooms] = await Promise.all([
      termId
        ? tx.section.findMany({
            where: { cohort: { termId }, deletedAt: null },
            select: {
              id: true,
              displayName: true,
              cohort: {
                select: { batch: { select: { branch: { select: { departmentId: true } } } } },
              },
            },
            orderBy: { displayName: 'asc' },
          })
        : [],
      tx.room.findMany({
        where: { deletedAt: null },
        select: { id: true, code: true },
        orderBy: { code: 'asc' },
      }),
    ]);
    const may = (departmentId: string | null) =>
      can(tenant.authUser, 'timetable.publish', shareResource(tenant.institute.id, departmentId));
    return {
      termId,
      sections: sections
        .filter((s) => may(s.cohort.batch.branch.departmentId))
        .map((s) => ({ id: s.id, label: s.displayName })),
      rooms: may(null) ? rooms.map((r) => ({ id: r.id, label: `Room ${r.code}` })) : [],
    };
  }

  async listLinks(tenant: Tenant): Promise<PublicLinksV1> {
    return this.prisma.tenant(this.ctx(tenant), async (tx) => {
      const choices = await this.targets(tx, tenant);
      const allowed = new Set([...choices.sections, ...choices.rooms].map((c) => c.id));
      const rows = await tx.portalPublicLink.findMany({
        where: { revokedAt: null },
        orderBy: [{ kind: 'asc' }, { label: 'asc' }],
      });
      return {
        links: rows.filter((r) => allowed.has(r.targetId)).map((r) => this.linkDto(r)),
        choices: { sections: choices.sections, rooms: choices.rooms },
      };
    });
  }

  /** Makes a link, or returns the one that already exists for that section or room. */
  async createLink(tenant: Tenant, body: CreatePublicLinkBody): Promise<PublicLinkV1> {
    return this.prisma.tenant(this.ctx(tenant), async (tx) => {
      const choices = await this.targets(tx, tenant);
      const target = (body.kind === 'section' ? choices.sections : choices.rooms).find(
        (c) => c.id === body.targetId,
      );
      if (!target) throw new ForbiddenException(NOT_ALLOWED);
      const existing = await tx.portalPublicLink.findFirst({
        where: { kind: body.kind, targetId: body.targetId, revokedAt: null },
      });
      const row =
        existing ??
        (await tx.portalPublicLink.create({
          data: {
            instituteId: tenant.institute.id,
            kind: body.kind,
            targetId: body.targetId,
            label: target.label,
            createdById: tenant.user.id,
          },
        }));
      return this.linkDto(row);
    });
  }

  /** Stops a link (the printed QR code shows "doesn't work any more"). */
  async revokeLink(tenant: Tenant, id: string): Promise<void> {
    await this.prisma.tenant(this.ctx(tenant), async (tx) => {
      const row = await tx.portalPublicLink.findFirst({ where: { id, revokedAt: null } });
      if (!row) throw new NotFoundException(NOT_FOUND);
      const choices = await this.targets(tx, tenant);
      const allowed = [...choices.sections, ...choices.rooms].some((c) => c.id === row.targetId);
      if (!allowed) throw new ForbiddenException(NOT_ALLOWED);
      await tx.portalPublicLink.update({ where: { id }, data: { revokedAt: new Date() } });
    });
  }

  /** What anyone with the link sees: the section's or room's published week. */
  async publicTimetable(institute: Institute, token: string): Promise<PublicTimetableV1> {
    const id = linkId('public', token, this.env.API_JWT_SECRET);
    if (!id) throw new NotFoundException(NOT_FOUND);
    const today = localNow(institute.timezone).date;
    const found = await this.prisma.tenant(
      { instituteId: institute.id, userId: null },
      async (tx) => {
        const link = await tx.portalPublicLink.findFirst({ where: { id, revokedAt: null } });
        if (!link) return null;
        return { link, termId: await this.viewers.termOn(tx, today) };
      },
    );
    if (!found) throw new NotFoundException(NOT_FOUND);
    const { link, termId } = found;

    // Read as the person who made the link: P2T's route checks their permission.
    const week = termId
      ? await this.timetable.week({
          instituteSlug: institute.slug,
          userId: link.createdById,
          termId,
          query: link.kind === 'section' ? { sectionId: link.targetId } : { roomId: link.targetId },
        })
      : null;
    const slots = week?.slots ?? [];
    const workingDays = await this.prisma.tenant(
      { instituteId: institute.id, userId: null },
      (tx) =>
        this.viewers.workingDays(
          tx,
          null,
          slots.map((s) => s.weekday),
        ),
    );
    return {
      instituteName: institute.name,
      kind: link.kind,
      label: link.label,
      workingDays,
      versionNumber: week?.version?.number ?? null,
      validFrom: week?.version ? week.version.validFrom : null,
      classes: slots
        .map((s) => ({
          weekday: s.weekday,
          startMinute: s.startMinute,
          endMinute: s.endMinute,
          component: s.component,
          courseCode: s.course.code,
          courseShortName: s.course.shortName,
          courseTitle: s.course.title,
          group: s.target.name,
          teachers: s.faculty.map((f) => f.name).join(', '),
          roomCode: s.room?.code ?? null,
        }))
        .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute),
    };
  }
}
