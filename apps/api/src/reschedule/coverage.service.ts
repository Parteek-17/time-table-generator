import { Injectable } from '@nestjs/common';
import type { TimetableSlotV1 } from '@slotwise/shared/contracts';
import {
  calendarFromSnapshot,
  syllabusCoverage,
  todayIn,
  type CoverageDto,
  type CoverageQuery,
} from '@slotwise/shared/reschedule';
import type { Tenant } from '../common/request-context';
import { PrismaService } from '../db/prisma.service';
import { isoDate } from './access';
import { TermSource } from './term-source';

/** Syllabus coverage per course and section: scheduled − lost + made up vs syllabus hours. */
@Injectable()
export class CoverageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly source: TermSource,
  ) {}

  async coverage(tenant: Tenant, termId: string, q: CoverageQuery): Promise<CoverageDto> {
    const snapshot = await this.source.snapshot(tenant, termId);
    const cal = calendarFromSnapshot(snapshot);
    const sectionIds = [...cal.sections]
      .filter(([id, place]) =>
        q.sectionId
          ? id === q.sectionId
          : q.departmentId
            ? place.departmentId === q.departmentId
            : true,
      )
      .map(([id]) => id);
    const today = todayIn(new Date(), snapshot.timezone);
    if (sectionIds.length === 0) return { today, rows: [] };

    const published = await this.source.published(tenant, termId, { sectionIds });
    if (!published.version) return { today, rows: [] };
    const cancellations = await this.prisma.tenant(
      { instituteId: tenant.institute.id, userId: tenant.user.id },
      (tx) =>
        tx.cancellation.findMany({
          where: { termId, sectionIds: { hasSome: sectionIds } },
          include: { makeUp: true },
        }),
    );
    return {
      today,
      rows: syllabusCoverage({
        slots: published.slots,
        version: published.version,
        cal,
        cancellations: cancellations.map((c) => ({
          slot: c.slot as unknown as TimetableSlotV1,
          date: isoDate(c.date),
          periods: c.periods,
          makeUp: c.makeUp && { date: isoDate(c.makeUp.date), length: c.makeUp.length },
        })),
        syllabusHours: new Map(snapshot.courses.map((c) => [c.id, c.syllabusHours])),
        sectionNames: new Map(snapshot.sections.map((s) => [s.id, s.displayName])),
        today,
      }),
    };
  }
}
