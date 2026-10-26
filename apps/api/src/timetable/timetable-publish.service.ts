import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { TxClient } from '@slotwise/db';
import { can } from '@slotwise/shared';
import {
  parseEvent,
  type EventNameV1,
  type EventPayloadV1,
  type SetupSnapshotV1,
} from '@slotwise/shared/contracts';
import {
  changedSections,
  dateIn,
  dayBefore,
  publishValidFrom,
  type PublishResult,
  type UndoPublishResult,
} from '@slotwise/shared/timetable';
import { randomUUID } from 'node:crypto';
import type { Tenant } from '../common/request-context';
import { PrismaService } from '../db/prisma.service';
import { tenantLong } from './tenant-tx';
import { copyVersionTx, versionDepartments, type Version } from './timetable-edit.service';

const NOT_ALLOWED =
  'You don’t have permission to publish these timetables. Ask your HOD or institute admin.';
const REPLACED =
  'A newer timetable has replaced this one. Make an editable copy of it if you want to publish it again.';
const NOT_CURRENT = 'Only the timetable that is published now can be taken back.';

type Pending = { [N in EventNameV1]: { name: N; payload: EventPayloadV1<N> } }[EventNameV1];

const isoDate = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;
const asDate = (date: string) => new Date(`${date}T00:00:00Z`);

/**
 * Publishing: a draft becomes the term's (or timetable group's) published version, the one it
 * replaces is archived, and `timetable.published` / `timetable.version.archived` go out once,
 * after the transaction commits. Undo puts the previous version back and keeps the undone
 * one's classes as a new draft.
 */
@Injectable()
export class TimetablePublishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async publish(tenant: Tenant, versionId: string): Promise<PublishResult> {
    const { result, events } = await tenantLong(this.prisma, this.ctx(tenant), async (tx) => {
      const version = await this.lockAndLoad(tx, versionId);
      this.assertMayPublish(tenant, version);
      if (version.status === 'published') {
        return {
          result: {
            versionId: version.id,
            number: version.number!,
            previousVersionId: null,
            validFrom: isoDate(version.validFrom)!,
            alreadyPublished: true,
          },
          events: [] as Pending[],
        };
      }
      if (version.status === 'archived') throw new ConflictException(REPLACED);

      const validFrom = await this.validFrom(tx, tenant, version.termId);
      const previous = await this.current(tx, version);
      const events: Pending[] = [];
      if (previous) events.push(await this.archive(tx, tenant, previous, validFrom, version.id));

      const last = await tx.timetableVersion.aggregate({
        where: { termId: version.termId, scopeId: version.scopeId },
        _max: { number: true },
      });
      const number = (last._max.number ?? 0) + 1;
      await tx.timetableVersion.update({
        where: { id: version.id },
        data: {
          status: 'published',
          number,
          publishedAt: new Date(),
          publishedById: tenant.user.id,
          validFrom: asDate(validFrom),
          validTo: null,
        },
      });
      events.push(this.published(tenant, version, previous, validFrom));
      return {
        result: {
          versionId: version.id,
          number,
          previousVersionId: previous?.id ?? null,
          validFrom,
          alreadyPublished: false,
        },
        events,
      };
    });
    this.emit(events);
    return result;
  }

  async undoPublish(tenant: Tenant, versionId: string): Promise<UndoPublishResult> {
    const { result, events } = await tenantLong(this.prisma, this.ctx(tenant), async (tx) => {
      const version = await this.lockAndLoad(tx, versionId);
      this.assertMayPublish(tenant, version);
      if (version.status !== 'published') throw new ConflictException(NOT_CURRENT);

      // The version it replaced: the newest archived one of the same term and group before it.
      const previous = await tx.timetableVersion.findFirst({
        where: {
          termId: version.termId,
          scopeId: version.scopeId,
          status: 'archived',
          number: { lt: version.number! },
        },
        orderBy: { number: 'desc' },
        include: { snapshot: true, slots: true },
      });
      const today = await this.validFrom(tx, tenant, version.termId);
      const validFrom =
        previous && isoDate(previous.validFrom)! > today ? isoDate(previous.validFrom)! : today;

      const events: Pending[] = [
        await this.archive(tx, tenant, version, today, previous?.id ?? null),
      ];
      if (previous) {
        await tx.timetableVersion.update({
          where: { id: previous.id },
          data: { status: 'published', archivedAt: null, validTo: null },
        });
        events.push(this.published(tenant, previous, version, validFrom));
      }
      const draft = await copyVersionTx(tx, version, tenant.user.id);
      return {
        result: { restoredVersionId: previous?.id ?? null, draftVersionId: draft.id },
        events,
      };
    });
    this.emit(events);
    return result;
  }

  private ctx(tenant: Tenant) {
    return { instituteId: tenant.institute.id, userId: tenant.user.id };
  }

  /**
   * One publish at a time per term and timetable group, so a double click or two coordinators
   * publishing together give exactly one published version and one event.
   */
  private async lockAndLoad(tx: TxClient, versionId: string): Promise<Version> {
    const head = await tx.timetableVersion.findUnique({
      where: { id: versionId },
      select: { termId: true, scopeId: true },
    });
    if (!head) throw new NotFoundException('We could not find this timetable.');
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`p2t.publish:${head.termId}:${head.scopeId ?? ''}`}))`;
    // Read again after the lock: another publish may have just finished.
    return tx.timetableVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: { snapshot: true, slots: true },
    });
  }

  private assertMayPublish(tenant: Tenant, version: Version): void {
    const allowed = versionDepartments(version).every((departmentId) =>
      can(tenant.authUser, 'timetable.publish', {
        type: 'timetable',
        instituteId: tenant.institute.id,
        departmentId,
      }),
    );
    if (!allowed) throw new ForbiddenException(NOT_ALLOWED);
  }

  /** Today in the institute's timezone, kept inside the term. */
  private async validFrom(tx: TxClient, tenant: Tenant, termId: string): Promise<string> {
    const term = await tx.term.findUniqueOrThrow({ where: { id: termId } });
    return publishValidFrom(
      dateIn(new Date(), tenant.institute.timezone),
      isoDate(term.startDate)!,
      isoDate(term.endDate)!,
    );
  }

  private current(tx: TxClient, version: Version): Promise<Version | null> {
    return tx.timetableVersion.findFirst({
      where: { termId: version.termId, scopeId: version.scopeId, status: 'published' },
      include: { snapshot: true, slots: true },
    });
  }

  /** Archives `version` from `until` on (it applied up to the day before). */
  private async archive(
    tx: TxClient,
    tenant: Tenant,
    version: Version,
    until: string,
    replacedByVersionId: string | null,
  ): Promise<Pending> {
    const from = isoDate(version.validFrom);
    // Never before its own first day (a version undone on the day it was published).
    const validTo = from && dayBefore(until) < from ? dayBefore(from) : dayBefore(until);
    await tx.timetableVersion.update({
      where: { id: version.id },
      data: { status: 'archived', archivedAt: new Date(), validTo: asDate(validTo) },
    });
    return {
      name: 'timetable.version.archived',
      payload: parseEvent('timetable.version.archived', {
        ...this.envelope(tenant),
        termId: version.termId,
        versionId: version.id,
        replacedByVersionId,
      }),
    };
  }

  private published(
    tenant: Tenant,
    version: Version,
    previous: Version | null,
    validFrom: string,
  ): Pending {
    // Written only from a validated SetupSnapshotV1.
    const snapshot = version.snapshot.data as unknown as SetupSnapshotV1;
    const allSections = snapshot.sections
      .filter((s) => version.cohortIds.includes(s.cohortId))
      .map((s) => s.id);
    const diffable = (v: Version) =>
      v.slots.map((s) => ({ ...s, startPeriodIndex: s.startPeriod }));
    return {
      name: 'timetable.published',
      payload: parseEvent('timetable.published', {
        ...this.envelope(tenant),
        termId: version.termId,
        versionId: version.id,
        previousVersionId: previous?.id ?? null,
        scopeId: version.scopeId,
        sectionIds: changedSections(
          previous ? diffable(previous) : null,
          diffable(version),
          allSections,
        ),
        validFrom,
      }),
    };
  }

  private envelope(tenant: Tenant) {
    return {
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      instituteId: tenant.institute.id,
      actorUserId: tenant.user.id,
    };
  }

  /** After commit, so listeners never see a publish that was rolled back. */
  private emit(events: Pending[]): void {
    for (const e of events) this.events.emit(e.name, e.payload);
  }
}
