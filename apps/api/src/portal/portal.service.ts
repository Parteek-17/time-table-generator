import { Injectable } from '@nestjs/common';
import type { TimetableReadResponseV1, TodayV1 } from '@slotwise/shared/contracts';
import {
  addDays,
  buildToday,
  buildWeek,
  CHANGES_DAYS_AHEAD,
  localNow,
  weekStartOf,
  type PortalWeekV1,
  type TodayInput,
} from '@slotwise/shared/portal';
import type { Tenant } from '../common/request-context';
import { PrismaService } from '../db/prisma.service';
import { PortalViewerService } from './portal-viewer.service';
import { PublishedTimetableClient } from './timetable.client';

const EMPTY: TimetableReadResponseV1 = { contract: 'timetable-read.v1', version: null, slots: [] };

/** "Today" and the week view for the signed-in student or teacher (their own data only). */
@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly viewers: PortalViewerService,
    private readonly timetable: PublishedTimetableClient,
  ) {}

  async today(tenant: Tenant, date?: string, now = new Date()): Promise<TodayV1> {
    const { input } = await this.load(tenant, date, now, (d) => [
      d,
      addDays(d, CHANGES_DAYS_AHEAD),
    ]);
    return buildToday(input);
  }

  async week(tenant: Tenant, date?: string, now = new Date()): Promise<PortalWeekV1> {
    const { input, versionId } = await this.load(tenant, date, now, (d) => {
      const start = weekStartOf(d);
      return [start, addDays(start, 6)];
    });
    return buildWeek({ ...input, versionId });
  }

  private async load(
    tenant: Tenant,
    date: string | undefined,
    now: Date,
    range: (date: string) => [string, string],
  ): Promise<{ input: TodayInput; versionId: string | null }> {
    const timezone = tenant.institute.timezone;
    const local = localNow(timezone, now);
    const day = date ?? local.date;
    const ctx = { instituteId: tenant.institute.id, userId: tenant.user.id };

    const resolved = await this.prisma.tenant(ctx, (tx) => this.viewers.resolve(tx, tenant, day));
    // Outside the transaction: the HTTP call must not hold a database connection.
    const week =
      resolved.termId && Object.keys(resolved.query).length > 0
        ? await this.timetable.week({
            instituteSlug: tenant.institute.slug,
            userId: tenant.user.id,
            termId: resolved.termId,
            query: resolved.query,
          })
        : EMPTY;
    const [from, to] = range(day);
    const calendar = await this.prisma.tenant(ctx, (tx) =>
      this.viewers.calendar(
        tx,
        resolved,
        from,
        to,
        week.slots.map((s) => s.weekday),
      ),
    );
    return {
      input: {
        viewer: resolved.viewer,
        timezone,
        date: day,
        now: local,
        slots: week.slots,
        calendar,
      },
      versionId: week.version?.id ?? null,
    };
  }
}
