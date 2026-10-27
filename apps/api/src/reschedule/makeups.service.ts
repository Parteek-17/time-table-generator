import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { parseEvent, type SetupSnapshotV1, type TimetableSlotV1 } from '@slotwise/shared/contracts';
import {
  addDays,
  calendarFromSnapshot,
  checkChoice,
  findMakeUps,
  makeUpRequestFrom,
  minuteIn,
  searchWeeks,
  todayIn,
  type BookMakeUpInput,
  type MakeUpDto,
  type MakeUpOptionsDto,
  type MakeUpProblem,
  type MakeUpRequest,
  type MakeUpWorld,
} from '@slotwise/shared/reschedule';
import { randomUUID } from 'node:crypto';
import type { Tenant } from '../common/request-context';
import { PrismaService } from '../db/prisma.service';
import { asDate, assertMayChangeClass, isoDate } from './access';
import { toDto } from './cancellations.service';
import type { Cancellation } from './db-types';
import { DisruptionsService, matchOf } from './disruptions.service';
import { tenantTx } from './tenant-tx';
import { TermSource } from './term-source';

const GONE = 'This class is not cancelled any more.';

interface Context {
  snapshot: SetupSnapshotV1;
  cancellation: Cancellation;
  slot: TimetableSlotV1;
  request: MakeUpRequest;
}

/**
 * Make-ups: free (date, periods, room) choices for a cancelled class, booking one (checked
 * again under a lock, so two coordinators can't take the same room), and undo.
 */
@Injectable()
export class MakeUpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly source: TermSource,
    private readonly disruptions: DisruptionsService,
  ) {}

  async options(tenant: Tenant, cancellationId: string): Promise<MakeUpOptionsDto> {
    const { snapshot, cancellation, slot, request } = await this.context(tenant, cancellationId);
    const existing = await this.prisma.tenant(this.ctx(tenant), (tx) =>
      tx.makeUp.findUnique({ where: { cancellationId } }),
    );
    const world = await this.world(tenant, snapshot, cancellation, request);
    const found = findMakeUps({ ...request, ignoreMakeUpId: existing?.id }, world);
    return {
      cancellation: toDto(cancellation, existing),
      options: found.options,
      problem: found.problem && problemText(found.problem, slot, request, 'search'),
    };
  }

  async book(tenant: Tenant, cancellationId: string, input: BookMakeUpInput): Promise<MakeUpDto> {
    const { snapshot, cancellation, slot, request } = await this.context(tenant, cancellationId);
    const world = await this.world(tenant, snapshot, cancellation, request);

    const booked = await tenantTx(this.prisma, tenant, async (tx) => {
      // One booking per institute and date at a time: the room and teacher check below must
      // see every make-up committed before it.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`p4.makeup:${tenant.institute.id}:${input.date}`}))`;
      const current = await tx.cancellation.findUnique({
        where: { id: cancellationId },
        include: { makeUp: true },
      });
      if (!current) throw new NotFoundException(GONE);
      const sameDay = await tx.makeUp.findMany({
        where: { termId: cancellation.termId, date: asDate(input.date) },
      });
      const fresh: MakeUpWorld = {
        ...world,
        makeUps: [...world.makeUps.filter((m) => m.date !== input.date), ...sameDay.map(booking)],
      };
      const result = checkChoice(
        { ...request, ignoreMakeUpId: current.makeUp?.id },
        fresh,
        input.date,
        input.startPeriodIndex,
        input.roomId,
      );
      if ('problem' in result) {
        throw new ConflictException(problemText(result.problem, slot, request, 'choice'));
      }
      // Booking again moves the make-up.
      if (current.makeUp) await tx.makeUp.delete({ where: { id: current.makeUp.id } });
      const { option } = result;
      return tx.makeUp.create({
        data: {
          instituteId: tenant.institute.id,
          termId: cancellation.termId,
          cancellationId,
          date: asDate(option.date),
          startPeriodIndex: option.startPeriodIndex,
          length: option.length,
          startMinute: option.startMinute,
          endMinute: option.endMinute,
          roomId: option.roomId,
          roomCode: option.roomCode,
          sectionIds: slot.sectionIds,
          facultyIds: slot.faculty.map((f) => f.id),
          createdById: tenant.user.id,
        },
      });
    });

    this.disruptions.emit([
      {
        name: 'makeup.approved',
        payload: parseEvent('makeup.approved', {
          eventId: randomUUID(),
          occurredAt: new Date().toISOString(),
          instituteId: tenant.institute.id,
          actorUserId: tenant.user.id,
          makeUpId: booked.id,
          cancellationId,
          date: isoDate(booked.date),
          startPeriodIndex: booked.startPeriodIndex,
          length: booked.length,
          startMinute: booked.startMinute,
          endMinute: booked.endMinute,
          roomId: booked.roomId,
          facultyIds: booked.facultyIds,
          sectionIds: booked.sectionIds,
        }),
      },
    ]);
    return toDto(cancellation, booked).makeUp!;
  }

  async undo(tenant: Tenant, makeUpId: string): Promise<{ removed: true }> {
    const existing = await this.prisma.tenant(this.ctx(tenant), (tx) =>
      tx.makeUp.findUnique({ where: { id: makeUpId }, include: { cancellation: true } }),
    );
    if (!existing) throw new NotFoundException('This make-up class was already removed.');
    const snapshot = await this.source.snapshot(tenant, existing.termId);
    assertMayChangeClass(
      tenant,
      existing.cancellation.slot as unknown as TimetableSlotV1,
      calendarFromSnapshot(snapshot),
    );
    await this.prisma.tenant(this.ctx(tenant), (tx) =>
      tx.makeUp.deleteMany({ where: { id: makeUpId } }),
    );
    return { removed: true };
  }

  private async context(tenant: Tenant, cancellationId: string): Promise<Context> {
    const cancellation = await this.prisma.tenant(this.ctx(tenant), (tx) =>
      tx.cancellation.findUnique({ where: { id: cancellationId } }),
    );
    if (!cancellation) throw new NotFoundException(GONE);
    const slot = cancellation.slot as unknown as TimetableSlotV1;
    const snapshot = await this.source.snapshot(tenant, cancellation.termId);
    assertMayChangeClass(tenant, slot, calendarFromSnapshot(snapshot));
    const now = new Date();
    const request = makeUpRequestFrom(snapshot, slot, isoDate(cancellation.date), {
      today: todayIn(now, snapshot.timezone),
      nowMinute: minuteIn(now, snapshot.timezone),
    });
    if ('problem' in request) {
      throw new ConflictException(
        request.problem === 'no_bell_schedule'
          ? 'This class’s section has no bell schedule. Add one in the setup first.'
          : 'This course has no room type for this kind of class. Check the scheme in the setup.',
      );
    }
    return { snapshot, cancellation, slot, request };
  }

  /** Who is busy in the two weeks searched: every published class, cancellations, make-ups, disruptions. */
  private async world(
    tenant: Tenant,
    snapshot: SetupSnapshotV1,
    cancellation: Cancellation,
    request: MakeUpRequest,
  ): Promise<MakeUpWorld> {
    const cal = calendarFromSnapshot(snapshot);
    const published = await this.source.published(tenant, cancellation.termId, {
      sectionIds: [...cal.sections.keys()],
    });
    const { same, next } = searchWeeks(request.date, request.today);
    const from = asDate(same);
    const to = asDate(addDays(next, 6));
    const { cancelled, makeUps, disruptions } = await this.prisma.tenant(
      this.ctx(tenant),
      async (tx) => ({
        cancelled: await tx.cancellation.findMany({
          where: { termId: cancellation.termId, date: { gte: from, lte: to } },
          select: { slotId: true, date: true },
        }),
        makeUps: await tx.makeUp.findMany({
          where: { termId: cancellation.termId, date: { gte: from, lte: to } },
        }),
        disruptions: await tx.disruption.findMany({
          where: {
            termId: cancellation.termId,
            deletedAt: null,
            kind: { not: 'room_unavailable' },
            startDate: { lte: to },
            endDate: { gte: from },
          },
        }),
      }),
    );
    return {
      cal,
      version: published.version ?? { validFrom: cal.termStart, validTo: null },
      slots: published.slots,
      cancelled: new Set(cancelled.map((c) => `${c.slotId} ${isoDate(c.date)}`)),
      makeUps: makeUps.map(booking),
      disruptions: disruptions.map(matchOf),
    };
  }

  private ctx(tenant: Tenant) {
    return { instituteId: tenant.institute.id, userId: tenant.user.id };
  }
}

function booking(m: {
  id: string;
  date: Date;
  startMinute: number;
  endMinute: number;
  length: number;
  roomId: string;
  sectionIds: string[];
  facultyIds: string[];
}) {
  return { ...m, date: isoDate(m.date) };
}

/** Why there is no make-up (search) or why a chosen one doesn't work (choice), in plain words. */
function problemText(
  problem: MakeUpProblem,
  slot: TimetableSlotV1,
  request: MakeUpRequest,
  mode: 'search' | 'choice',
): string {
  const group = slot.target.name;
  const teachers = slot.faculty.map((f) => f.name).join(' and ') || 'the teacher';
  const when = mode === 'search' ? 'in this week or the next' : 'then';
  switch (problem) {
    case 'no_teaching_day':
      return mode === 'search'
        ? `${group} has no teaching days left in this week or the next.`
        : `${group} has no class that day or at that time (holiday, event or past).`;
    case 'class_busy':
      return `${group} has another class ${mode === 'search' ? 'at every free time ' : ''}${when}.`;
    case 'teacher_busy':
      return `${teachers} has no free period together with ${group} ${when}.`;
    case 'teacher_unavailable':
      return `${teachers} is on leave or not available ${when}.`;
    case 'teacher_day_full':
      return `${teachers} already teaches the most periods allowed in a day ${when}.`;
    case 'no_room':
      return request.rooms.length === 0
        ? `No room of the right type is big enough for ${group}. Check the rooms in the setup.`
        : `No suitable room is free when ${group} and ${teachers} are free ${when}.`;
  }
}
