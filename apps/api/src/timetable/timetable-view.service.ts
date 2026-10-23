import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { canSomewhere } from '@slotwise/shared';
import type { SetupSnapshotV1 } from '@slotwise/shared/contracts';
import {
  compareSlots,
  slotIsFor,
  subGroupSections,
  toSlotV1,
  viewBell,
  viewChoices,
  type TimetableViewDto,
  type TimetableViewQuery,
} from '@slotwise/shared/timetable';
import type { Tenant } from '../common/request-context';
import { PrismaService } from '../db/prisma.service';
import { storedSlot } from './timetable-read.service';

const DRAFTS_NOT_ALLOWED =
  'Only timetable coordinators can see draft timetables. Ask your institute admin.';

export interface ScopeChoice {
  id: string;
  name: string;
  cohortCount: number;
}

/** The timetable screen: one version's week for one section, sub-group, teacher or room. */
@Injectable()
export class TimetableViewService {
  constructor(private readonly prisma: PrismaService) {}

  async view(
    tenant: Tenant,
    versionId: string,
    query: TimetableViewQuery,
  ): Promise<TimetableViewDto> {
    const place = {
      id: tenant.institute.id,
      parentUniversityId: tenant.institute.parentUniversityId,
    };
    return this.prisma.tenant(
      { instituteId: tenant.institute.id, userId: tenant.user.id },
      async (tx) => {
        const version = await tx.timetableVersion.findUnique({
          where: { id: versionId },
          include: { snapshot: true, slots: true, _count: { select: { slots: true } } },
        });
        if (!version) throw new NotFoundException('We could not find this timetable.');
        if (version.status === 'draft' && !canSomewhere(tenant.authUser, 'timetable.edit', place)) {
          throw new ForbiddenException(DRAFTS_NOT_ALLOWED);
        }
        // Written only from a validated SetupSnapshotV1.
        const snapshot = version.snapshot.data as unknown as SetupSnapshotV1;
        const choices = viewChoices(snapshot);
        const kind = query.kind ?? 'section';
        const chosen = query.id ? choices[kind].find((c) => c.id === query.id) : choices[kind][0];
        if (query.id && !chosen) {
          throw new NotFoundException(
            'This timetable has no such section, sub-group, teacher or room.',
          );
        }
        const who = chosen ? { kind, id: chosen.id, name: chosen.name } : null;
        const subGroupSection =
          who?.kind === 'subgroup' ? (subGroupSections(snapshot).get(who.id) ?? null) : null;
        const slots = who
          ? version.slots
              .map(storedSlot)
              .filter((s) => slotIsFor(s, who, subGroupSection))
              .sort(compareSlots)
              .map((s) => ({ ...toSlotV1(s), locked: s.locked }))
          : [];
        return {
          version: {
            id: version.id,
            termId: version.termId,
            scopeId: version.scopeId,
            status: version.status,
            number: version.number,
            parentId: version.parentId,
            solveJobId: version.solveJobId,
            slotCount: version._count.slots,
            unplacedCount: Array.isArray(version.unplaced) ? version.unplaced.length : 0,
            createdAt: version.createdAt.toISOString(),
            publishedAt: version.publishedAt?.toISOString() ?? null,
            validFrom: version.validFrom?.toISOString().slice(0, 10) ?? null,
          },
          who,
          bell: viewBell(snapshot, who) ?? { workingDays: [], periods: [], breaks: [] },
          slots,
          choices,
        };
      },
    );
  }

  /** The term's timetable groups (P1's timetable scopes), for the Generate screen. */
  async scopes(tenant: Tenant, termId: string): Promise<ScopeChoice[]> {
    const rows = await this.prisma.tenant(
      { instituteId: tenant.institute.id, userId: tenant.user.id },
      (tx) =>
        tx.timetableScope.findMany({
          where: { termId, deletedAt: null },
          orderBy: { name: 'asc' },
          include: { _count: { select: { cohorts: true } } },
        }),
    );
    return rows.map((s) => ({ id: s.id, name: s.name, cohortCount: s._count.cohorts }));
  }
}
