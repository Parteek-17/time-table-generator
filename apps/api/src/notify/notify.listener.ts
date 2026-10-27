import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { isFlagOn } from '@slotwise/shared';
import {
  NOTIFY_REQUESTED_V1,
  NOTIFY_V1,
  type EventPayloadV1,
  type NotificationRequestV1Input,
  type TimetableSlotV1,
} from '@slotwise/shared/contracts';
import { minuteIn, todayIn } from '@slotwise/shared/reschedule';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../db/prisma.service';
import { NotifyService } from './notify.service';

const clock = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Who hears about what (CLAUDE.md: notifications for cancellations and make-ups):
 * - a holiday or event: one notice per disruption to every section and teacher whose classes it
 *   cancelled (not one per class);
 * - a class cancelled by hand: its sections and teachers;
 * - a make-up booked: its sections and teachers.
 * Nothing is sent for dates already past. Other streams' `notify.requested` go straight through.
 * Listeners never throw back into the producer (events.v1).
 */
@Injectable()
export class NotifyListener {
  private readonly logger = new Logger(NotifyListener.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
  ) {}

  @OnEvent(NOTIFY_REQUESTED_V1, { async: true })
  async requested(payload: NotificationRequestV1Input): Promise<void> {
    await this.safely('notify.requested', () => this.notify.request(payload, null));
  }

  @OnEvent('disruption.created', { async: true })
  async disruptionCreated(e: EventPayloadV1<'disruption.created'>): Promise<void> {
    await this.safely('disruption.created', async () => {
      const place = await this.place(e.instituteId);
      if (!place || e.endDate < place.today) return;
      const cancelled = await this.prisma.tenant(this.ctx(e), (tx) =>
        tx.cancellation.findMany({
          where: { disruptionId: e.disruptionId },
          select: { sectionIds: true, facultyIds: true },
        }),
      );
      if (cancelled.length === 0) return;
      await this.send(e, {
        idempotencyKey: `p4.classesCancelled:${e.disruptionId}`,
        templateKey: 'p4.classesCancelled',
        recipients: {
          sectionIds: [...new Set(cancelled.flatMap((c) => c.sectionIds))],
          facultyIds: [...new Set(cancelled.flatMap((c) => c.facultyIds))],
        },
        data: {
          title: e.title,
          dates:
            e.startDate === e.endDate
              ? dayLabel(e.startDate)
              : `${dayLabel(e.startDate)} – ${dayLabel(e.endDate)}`,
          count: cancelled.length,
          url: `${place.webUrl}/reschedule`,
        },
        priority: e.startDate === place.today ? 'urgent' : 'normal',
      });
    });
  }

  @OnEvent('class.cancelled', { async: true })
  async classCancelled(e: EventPayloadV1<'class.cancelled'>): Promise<void> {
    // Classes a holiday or event cancelled are covered by its one notice.
    if (e.disruptionId) return;
    await this.safely('class.cancelled', async () => {
      const place = await this.place(e.instituteId);
      if (!place || e.date < place.today) return;
      const c = await this.prisma.tenant(this.ctx(e), (tx) =>
        tx.cancellation.findUnique({ where: { id: e.cancellationId } }),
      );
      if (!c) return;
      const slot = c.slot as unknown as TimetableSlotV1;
      await this.send(e, {
        idempotencyKey: `p4.classCancelled:${e.cancellationId}`,
        templateKey: 'p4.classCancelled',
        recipients: { sectionIds: e.sectionIds, facultyIds: e.facultyIds },
        data: {
          course: `${slot.course.code} ${slot.course.shortName}`,
          group: slot.target.name,
          date: dayLabel(e.date),
          time: `${clock(slot.startMinute)}–${clock(slot.endMinute)}`,
          reason: e.reason,
          url: `${place.webUrl}/reschedule`,
        },
        priority: e.date === place.today ? 'urgent' : 'normal',
      });
    });
  }

  @OnEvent('makeup.approved', { async: true })
  async makeUpApproved(e: EventPayloadV1<'makeup.approved'>): Promise<void> {
    await this.safely('makeup.approved', async () => {
      const place = await this.place(e.instituteId);
      if (!place || e.date < place.today) return;
      const m = await this.prisma.tenant(this.ctx(e), (tx) =>
        tx.makeUp.findUnique({ where: { id: e.makeUpId }, include: { cancellation: true } }),
      );
      if (!m) return;
      const slot = m.cancellation.slot as unknown as TimetableSlotV1;
      await this.send(e, {
        idempotencyKey: `p4.makeUpBooked:${e.makeUpId}`,
        templateKey: 'p4.makeUpBooked',
        recipients: { sectionIds: e.sectionIds, facultyIds: e.facultyIds },
        data: {
          course: `${slot.course.code} ${slot.course.shortName}`,
          group: slot.target.name,
          date: dayLabel(e.date),
          time: `${clock(e.startMinute)}–${clock(e.endMinute)}`,
          room: m.roomCode,
          replaces: dayLabel(isoDate(m.cancellation.date)),
          url: `${place.webUrl}/reschedule`,
        },
        // Today's make-up, still ahead: tell people now.
        priority: e.date === place.today && e.startMinute > place.minute ? 'urgent' : 'normal',
      });
    });
  }

  private async send(
    e: { instituteId: string; actorUserId: string | null },
    request: Omit<NotificationRequestV1Input, 'version' | 'instituteId' | 'channels'>,
  ): Promise<void> {
    await this.notify.request(
      { ...request, version: NOTIFY_V1, instituteId: e.instituteId, channels: ['email'] },
      e.actorUserId,
    );
  }

  /** The institute's today, minute now and web address. */
  private async place(instituteId: string) {
    const institute = await this.prisma.institute.findUnique({ where: { id: instituteId } });
    if (!institute) return null;
    const now = new Date();
    return {
      today: todayIn(now, institute.timezone),
      minute: minuteIn(now, institute.timezone),
      webUrl: this.env.WEB_URL_TEMPLATE.replace('{slug}', institute.slug),
    };
  }

  private ctx(e: { instituteId: string; actorUserId: string | null }) {
    return { instituteId: e.instituteId, userId: e.actorUserId };
  }

  private async safely(event: string, fn: () => Promise<unknown>): Promise<void> {
    if (!isFlagOn('P4')) return;
    try {
      await fn();
    } catch (error) {
      this.logger.error(`${event}: could not queue the notice`, error as Error);
    }
  }
}
