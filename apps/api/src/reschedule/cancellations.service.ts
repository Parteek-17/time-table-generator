import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@slotwise/db';
import { can } from '@slotwise/shared';
import type { TimetableSlotV1 } from '@slotwise/shared/contracts';
import {
  calendarFromSnapshot,
  classMeetsOn,
  type CancelClassInput,
  type CancellationDto,
  type CancellationsQuery,
  type RescheduleCalendar,
} from '@slotwise/shared/reschedule';
import type { Tenant } from '../common/request-context';
import { PrismaService } from '../db/prisma.service';
import type { Cancellation, MakeUp } from './db-types';
import { asDate, DisruptionsService, isoDate } from './disruptions.service';
import { TermSource } from './term-source';

const NOT_ALLOWED =
  'You don’t have permission to cancel this class. Ask your HOD or the timetable in-charge.';

/** Single classes: cancel one by hand, list cancelled classes, undo a hand cancellation. */
@Injectable()
export class CancellationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly source: TermSource,
    private readonly disruptions: DisruptionsService,
  ) {}

  async cancel(tenant: Tenant, termId: string, input: CancelClassInput): Promise<CancellationDto> {
    const snapshot = await this.source.snapshot(tenant, termId);
    const cal = calendarFromSnapshot(snapshot);
    const published = await this.source.published(tenant, termId, {
      sectionIds: [input.sectionId],
    });
    const slot = published.slots.find((s) => s.id === input.slotId);
    if (!published.version || !slot) {
      throw new NotFoundException('We can’t find this class in the published timetable.');
    }
    this.assertMayChange(tenant, slot, cal);
    if (!classMeetsOn(slot, input.date, published.version, cal)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'This class doesn’t meet on that date.',
        fieldErrors: { date: ['This class doesn’t meet on that date.'] },
      });
    }

    let created: Cancellation;
    try {
      created = await this.prisma.tenant(this.ctx(tenant), (tx) =>
        tx.cancellation.create({
          data: {
            instituteId: tenant.institute.id,
            termId,
            slotId: slot.id,
            versionId: slot.versionId,
            date: asDate(input.date),
            courseId: slot.course.id,
            sectionIds: slot.sectionIds,
            facultyIds: slot.faculty.map((f) => f.id),
            periods: slot.length,
            slot: slot as unknown as Prisma.InputJsonValue,
            reason: input.reason,
            createdById: tenant.user.id,
          },
        }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This class is already cancelled on that date.');
      }
      throw error;
    }
    this.disruptions.emit([this.disruptions.classCancelled(tenant, created, slot)]);
    return toDto(created, null);
  }

  /** Undo a class cancelled by hand. Classes a holiday cancelled come back by undoing it. */
  async undo(tenant: Tenant, cancellationId: string): Promise<{ restored: true }> {
    const existing = await this.prisma.tenant(this.ctx(tenant), (tx) =>
      tx.cancellation.findUnique({ where: { id: cancellationId } }),
    );
    if (!existing) throw new NotFoundException('This class is not cancelled any more.');
    if (existing.disruptionId) {
      throw new ConflictException(
        `“${existing.reason}” cancelled this class. Undo that to bring its classes back.`,
      );
    }
    const snapshot = await this.source.snapshot(tenant, existing.termId);
    this.assertMayChange(
      tenant,
      existing.slot as unknown as TimetableSlotV1,
      calendarFromSnapshot(snapshot),
    );
    await this.prisma.tenant(this.ctx(tenant), (tx) =>
      tx.cancellation.deleteMany({ where: { id: cancellationId } }),
    );
    return { restored: true };
  }

  async list(tenant: Tenant, termId: string, q: CancellationsQuery): Promise<CancellationDto[]> {
    return this.prisma.tenant(this.ctx(tenant), async (tx) => {
      const rows = await tx.cancellation.findMany({
        where: {
          termId,
          ...(q.from || q.to
            ? {
                date: {
                  gte: q.from ? asDate(q.from) : undefined,
                  lte: q.to ? asDate(q.to) : undefined,
                },
              }
            : {}),
          ...(q.sectionId ? { sectionIds: { has: q.sectionId } } : {}),
          ...(q.facultyId ? { facultyIds: { has: q.facultyId } } : {}),
        },
        include: { makeUp: true },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        take: 1000,
      });
      return rows.map((r) => toDto(r, r.makeUp));
    });
  }

  /** timetable.edit for the department of every section in the class. */
  private assertMayChange(tenant: Tenant, slot: TimetableSlotV1, cal: RescheduleCalendar): void {
    const allowed = slot.sectionIds.every((sectionId) =>
      can(tenant.authUser, 'timetable.edit', {
        type: 'timetable',
        instituteId: tenant.institute.id,
        departmentId: cal.sections.get(sectionId)?.departmentId ?? null,
        sectionId,
      }),
    );
    if (!allowed) throw new ForbiddenException(NOT_ALLOWED);
  }

  private ctx(tenant: Tenant) {
    return { instituteId: tenant.institute.id, userId: tenant.user.id };
  }
}

export function toDto(c: Cancellation, makeUp: MakeUp | null): CancellationDto {
  return {
    id: c.id,
    date: isoDate(c.date),
    reason: c.reason,
    disruptionId: c.disruptionId,
    slot: c.slot as unknown as TimetableSlotV1,
    makeUp: makeUp && {
      id: makeUp.id,
      date: isoDate(makeUp.date),
      startPeriodIndex: makeUp.startPeriodIndex,
      length: makeUp.length,
      startMinute: makeUp.startMinute,
      endMinute: makeUp.endMinute,
      roomId: makeUp.roomId,
      roomCode: null,
    },
  };
}
