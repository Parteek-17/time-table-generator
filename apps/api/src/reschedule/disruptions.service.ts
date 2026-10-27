import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma, TxClient } from '@slotwise/db';
import { can, type Resource } from '@slotwise/shared';
import {
  parseEvent,
  type EventNameV1,
  type EventPayloadV1,
  type SetupSnapshotV1,
  type TimetableSlotV1,
} from '@slotwise/shared/contracts';
import {
  calendarFromSnapshot,
  classesHit,
  disruptionCoversSlot,
  overlapsHours,
  type CreateDisruptionInput,
  type CreateDisruptionResult,
  type DisruptionDto,
  type DisruptionMatch,
  type RescheduleCalendar,
  type UndoDisruptionResult,
} from '@slotwise/shared/reschedule';
import { randomUUID } from 'node:crypto';
import type { Tenant } from '../common/request-context';
import { PrismaService } from '../db/prisma.service';
import { asDate, isoDate } from './access';
import type { Disruption } from './db-types';
import { tenantTx } from './tenant-tx';
import { TermSource, type SlotQuery } from './term-source';

const NOT_ALLOWED =
  'You don’t have permission to cancel classes here. Ask your HOD or the timetable in-charge.';
const NOT_FOUND = 'We can’t find this holiday or event. It may have been undone already.';

type Pending = { [N in EventNameV1]: { name: N; payload: EventPayloadV1<N> } }[EventNameV1];

/**
 * Holidays, events and faculty leave (disruptions). Creating one cancels the published
 * classes it overlaps for its scope; undo gives them back unless another disruption still
 * covers them. `disruption.created` and `class.cancelled` go out after the commit.
 */
@Injectable()
export class DisruptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly source: TermSource,
    private readonly events: EventEmitter2,
  ) {}

  async create(
    tenant: Tenant,
    termId: string,
    input: CreateDisruptionInput,
  ): Promise<CreateDisruptionResult> {
    const snapshot = await this.source.snapshot(tenant, termId);
    const cal = calendarFromSnapshot(snapshot);
    this.assertMayChange(tenant, this.resourceFor(input, snapshot, cal));
    if (input.startDate < cal.termStart || input.endDate > cal.termEnd) {
      throw new BadRequestException({
        statusCode: 400,
        message: `Choose dates inside the term (${cal.termStart} to ${cal.termEnd}).`,
        fieldErrors: { startDate: ['Choose dates inside the term.'] },
      });
    }

    const published = await this.source.published(tenant, termId, slotQuery(input, cal));
    const hits = published.version
      ? classesHit(input, published.slots, published.version, cal)
      : [];

    const { disruption, created, already } = await tenantTx(this.prisma, tenant, async (tx) => {
      const disruption = await tx.disruption.create({
        data: {
          instituteId: tenant.institute.id,
          termId,
          kind: input.kind,
          title: input.title,
          scopeType: input.scopeType,
          departmentId: input.departmentId,
          sectionId: input.sectionId,
          facultyId: input.facultyId,
          startDate: asDate(input.startDate),
          endDate: asDate(input.endDate),
          startMinute: input.startMinute,
          endMinute: input.endMinute,
          createdById: tenant.user.id,
        },
      });
      const created = await tx.cancellation.createManyAndReturn({
        data: hits.map(({ slot, date }) => ({
          instituteId: tenant.institute.id,
          termId,
          disruptionId: disruption.id,
          slotId: slot.id,
          versionId: slot.versionId,
          date: asDate(date),
          courseId: slot.course.id,
          sectionIds: slot.sectionIds,
          facultyIds: slot.faculty.map((f) => f.id),
          periods: slot.length,
          slot: slot as unknown as Prisma.InputJsonValue,
          reason: input.title,
          createdById: tenant.user.id,
        })),
        // A class another holiday (or a coordinator) already cancelled stays as it is.
        skipDuplicates: true,
      });
      return { disruption, created, already: hits.length - created.length };
    });

    this.emit([
      this.disruptionCreated(tenant, disruption),
      ...created.map((c) => this.classCancelled(tenant, c, c.slot as unknown as TimetableSlotV1)),
    ]);
    return {
      disruption: toDto(disruption, created.length),
      cancelled: created.length,
      alreadyCancelled: already,
      noTimetable: published.version === null,
    };
  }

  /**
   * Undo: the disruption is marked deleted and its classes come back, except those another
   * active disruption also covers; those move to it. Make-ups for given-back classes go too.
   */
  async undo(tenant: Tenant, disruptionId: string): Promise<UndoDisruptionResult> {
    const existing = await this.prisma.tenant(this.ctx(tenant), (tx) =>
      tx.disruption.findFirst({ where: { id: disruptionId, deletedAt: null } }),
    );
    if (!existing) throw new NotFoundException(NOT_FOUND);
    const snapshot = await this.source.snapshot(tenant, existing.termId);
    const cal = calendarFromSnapshot(snapshot);
    this.assertMayChange(tenant, this.resourceFor(matchOf(existing), snapshot, cal));

    return tenantTx(this.prisma, tenant, async (tx) => {
      const marked = await tx.disruption.updateMany({
        where: { id: disruptionId, deletedAt: null },
        data: { deletedAt: new Date(), deletedById: tenant.user.id },
      });
      // A second click (or another coordinator) got there first.
      if (marked.count === 0) throw new NotFoundException(NOT_FOUND);

      const cancellations = await tx.cancellation.findMany({ where: { disruptionId } });
      const others = await this.activeOverlapping(tx, existing);
      let keptByOther = 0;
      const restore: string[] = [];
      for (const c of cancellations) {
        const slot = c.slot as unknown as TimetableSlotV1;
        const date = isoDate(c.date);
        const other = others.find((o) => covers(matchOf(o), slot, date, cal));
        if (other) {
          keptByOther += 1;
          await tx.cancellation.update({
            where: { id: c.id },
            data: { disruptionId: other.id, reason: other.title },
          });
        } else {
          restore.push(c.id);
        }
      }
      // Make-ups go with their cancellation (onDelete: Cascade).
      await tx.cancellation.deleteMany({ where: { id: { in: restore } } });
      return { disruptionId, restored: restore.length, keptByOther };
    });
  }

  async list(tenant: Tenant, termId: string): Promise<DisruptionDto[]> {
    return this.prisma.tenant(this.ctx(tenant), async (tx) => {
      const rows = await tx.disruption.findMany({
        where: { termId, deletedAt: null },
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
        include: { _count: { select: { cancellations: true } } },
      });
      return rows.map((d) => toDto(d, d._count.cancellations));
    });
  }

  /** Active disruptions of the same term whose dates overlap this one's. */
  private activeOverlapping(tx: TxClient, d: Disruption): Promise<Disruption[]> {
    return tx.disruption.findMany({
      where: {
        termId: d.termId,
        deletedAt: null,
        id: { not: d.id },
        // It moves rooms rather than cancelling (not offered yet).
        kind: { not: 'room_unavailable' },
        startDate: { lte: d.endDate },
        endDate: { gte: d.startDate },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * What can() checks: institute-wide for an institute holiday, the department for a
   * department event, the section (and its department) for a section, and the teacher's home
   * department for leave.
   */
  private resourceFor(
    d: Pick<DisruptionMatch, 'kind' | 'scopeType' | 'departmentId' | 'sectionId' | 'facultyId'>,
    snapshot: SetupSnapshotV1,
    cal: RescheduleCalendar,
  ): Resource {
    const base: Resource = { type: 'timetable', instituteId: snapshot.instituteId };
    if (d.kind === 'faculty_leave') {
      const faculty = snapshot.faculty.find((f) => f.id === d.facultyId);
      if (!faculty) throw badField('facultyId', 'We can’t find that teacher in this term.');
      return { ...base, departmentId: faculty.homeDepartmentId };
    }
    if (d.scopeType === 'department') {
      const known = snapshot.cohorts.some((c) => c.departmentId === d.departmentId);
      if (!known) throw badField('departmentId', 'That department has no sections this term.');
      return { ...base, departmentId: d.departmentId };
    }
    if (d.scopeType === 'section') {
      const place = d.sectionId ? cal.sections.get(d.sectionId) : undefined;
      if (!place) throw badField('sectionId', 'We can’t find that section in this term.');
      return { ...base, departmentId: place.departmentId, sectionId: d.sectionId };
    }
    return base;
  }

  private assertMayChange(tenant: Tenant, resource: Resource): void {
    // The snapshot names the institute it was read for; the caller's is the one that counts.
    const target = { ...resource, instituteId: tenant.institute.id };
    if (!can(tenant.authUser, 'timetable.edit', target)) throw new ForbiddenException(NOT_ALLOWED);
  }

  private disruptionCreated(tenant: Tenant, d: Disruption): Pending {
    return {
      name: 'disruption.created',
      payload: parseEvent('disruption.created', {
        ...this.envelope(tenant),
        scopeType: d.scopeType,
        departmentId: d.departmentId,
        programmeId: null,
        cohortId: null,
        sectionId: d.sectionId,
        disruptionId: d.id,
        kind: d.kind,
        title: d.title,
        startDate: isoDate(d.startDate),
        endDate: isoDate(d.endDate),
        startMinute: d.startMinute,
        endMinute: d.endMinute,
        facultyId: d.facultyId,
        roomId: d.roomId,
      }),
    };
  }

  classCancelled(
    tenant: Tenant,
    c: { id: string; date: Date; reason: string; disruptionId: string | null },
    slot: TimetableSlotV1,
  ): Pending {
    return {
      name: 'class.cancelled',
      payload: parseEvent('class.cancelled', {
        ...this.envelope(tenant),
        cancellationId: c.id,
        slotId: slot.id,
        date: isoDate(c.date),
        sectionIds: slot.sectionIds,
        facultyIds: slot.faculty.map((f) => f.id),
        reason: c.reason,
        disruptionId: c.disruptionId,
      }),
    };
  }

  emit(events: Pending[]): void {
    for (const e of events) this.events.emit(e.name, e.payload);
  }

  private envelope(tenant: Tenant) {
    return {
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      instituteId: tenant.institute.id,
      actorUserId: tenant.user.id,
    };
  }

  private ctx(tenant: Tenant) {
    return { instituteId: tenant.institute.id, userId: tenant.user.id };
  }
}

/** Only the classes that can be hit: one section, a department's sections, a teacher, or all. */
function slotQuery(d: CreateDisruptionInput, cal: RescheduleCalendar): SlotQuery {
  if (d.kind === 'faculty_leave' && d.facultyId) return { facultyId: d.facultyId };
  if (d.scopeType === 'section' && d.sectionId) return { sectionIds: [d.sectionId] };
  const all = [...cal.sections];
  if (d.scopeType === 'department') {
    return {
      sectionIds: all.filter(([, p]) => p.departmentId === d.departmentId).map(([id]) => id),
    };
  }
  return { sectionIds: all.map(([id]) => id) };
}

export function matchOf(d: Disruption): DisruptionMatch {
  return {
    // room_unavailable is not offered yet; activeOverlapping() leaves those rows out.
    kind: d.kind as DisruptionMatch['kind'],
    scopeType: d.scopeType,
    departmentId: d.departmentId,
    sectionId: d.sectionId,
    facultyId: d.facultyId,
    startDate: isoDate(d.startDate),
    endDate: isoDate(d.endDate),
    startMinute: d.startMinute,
    endMinute: d.endMinute,
  };
}

function covers(d: DisruptionMatch, slot: TimetableSlotV1, date: string, cal: RescheduleCalendar) {
  return (
    d.startDate <= date &&
    date <= d.endDate &&
    disruptionCoversSlot(d, slot, cal.sections) &&
    overlapsHours(d, slot)
  );
}

function badField(field: string, message: string): BadRequestException {
  return new BadRequestException({ statusCode: 400, message, fieldErrors: { [field]: [message] } });
}

export function toDto(d: Disruption, cancelledCount: number): DisruptionDto {
  return {
    id: d.id,
    termId: d.termId,
    kind: d.kind,
    title: d.title,
    scopeType: d.scopeType,
    departmentId: d.departmentId,
    sectionId: d.sectionId,
    facultyId: d.facultyId,
    startDate: isoDate(d.startDate),
    endDate: isoDate(d.endDate),
    startMinute: d.startMinute,
    endMinute: d.endMinute,
    createdAt: d.createdAt.toISOString(),
    deletedAt: d.deletedAt?.toISOString() ?? null,
    cancelledCount,
  };
}
