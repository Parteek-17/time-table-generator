import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, TxClient } from '@slotwise/db';
import { can } from '@slotwise/shared';
import { TimetableReadResponseV1, type TimetableReadQueryV1 } from '@slotwise/shared/contracts';
import {
  readResponse,
  timetableFor,
  type SlotFaculty,
  type StoredSlot,
  type StoredVersion,
  type TimetableFor,
} from '@slotwise/shared/timetable';
import type { Tenant } from '../common/request-context';
import { PrismaService } from '../db/prisma.service';

// @slotwise/db re-exports only Phase 0 model types; derive ours from the Prisma namespace.
type TimetableSlot = Prisma.TimetableSlotGetPayload<object>;
type TimetableVersion = Prisma.TimetableVersionGetPayload<object>;

const NOT_ALLOWED = 'You don’t have permission to see timetables here. Ask your institute admin.';

/** Prisma rows → the shapes the shared read functions take. */
export function storedSlot(row: TimetableSlot): StoredSlot {
  return {
    id: row.id,
    versionId: row.versionId,
    sessionId: row.sessionId,
    assignmentId: row.assignmentId,
    component: row.component,
    courseId: row.courseId,
    courseCode: row.courseCode,
    courseShortName: row.courseShortName,
    courseTitle: row.courseTitle,
    targetKind: row.targetKind,
    targetId: row.targetId,
    targetName: row.targetName,
    sectionIds: row.sectionIds,
    facultyIds: row.facultyIds,
    // Written only by slotsFromPlacements() (SlotFaculty[]); Json has no element type.
    faculty: row.faculty as unknown as SlotFaculty[],
    roomId: row.roomId,
    roomCode: row.roomCode,
    weekday: row.weekday,
    startPeriod: row.startPeriod,
    length: row.length,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
    locked: row.locked,
  };
}

export function storedVersion(row: TimetableVersion): StoredVersion {
  return {
    id: row.id,
    termId: row.termId,
    scopeId: row.scopeId,
    number: row.number,
    status: row.status,
    publishedAt: row.publishedAt,
    publishedById: row.publishedById,
    validFrom: row.validFrom,
    validTo: row.validTo,
  };
}

/**
 * SQL-side narrowing; slotIsFor() in @slotwise/shared/timetable has the final say. A lookup,
 * not a switch: the lint rule against inline role checks flags `case 'faculty'`.
 */
const SLOT_WHERE: Record<
  TimetableFor['kind'],
  (id: string, subGroupSectionId: string | null) => Prisma.TimetableSlotWhereInput
> = {
  section: (id) => ({ sectionIds: { has: id } }),
  subgroup: (id, sectionId) =>
    sectionId ? { OR: [{ targetId: id }, { sectionIds: { has: sectionId } }] } : { targetId: id },
  faculty: (id) => ({ facultyIds: { has: id } }),
  room: (id) => ({ roomId: id }),
};

function slotWhere(
  who: TimetableFor,
  subGroupSectionId: string | null,
): Prisma.TimetableSlotWhereInput {
  return SLOT_WHERE[who.kind](who.id, subGroupSectionId);
}

/**
 * Published timetable read API (timetable-read.v1). Drafts never appear: only published
 * versions, or an archived one asked for by id.
 */
@Injectable()
export class TimetableReadService {
  constructor(private readonly prisma: PrismaService) {}

  async read(
    tenant: Tenant,
    termId: string,
    query: TimetableReadQueryV1,
  ): Promise<TimetableReadResponseV1> {
    if (
      !can(tenant.authUser, 'timetable.view', {
        type: 'timetable',
        instituteId: tenant.institute.id,
      })
    ) {
      throw new ForbiddenException(NOT_ALLOWED);
    }
    const who = timetableFor(query);
    return this.prisma.tenant(
      { instituteId: tenant.institute.id, userId: tenant.user.id },
      async (tx) => {
        const term = await tx.term.findFirst({
          where: { id: termId, deletedAt: null },
          select: { id: true },
        });
        if (!term) throw new NotFoundException('We could not find this term.');

        const candidates = await tx.timetableVersion.findMany({
          where: query.versionId
            ? { id: query.versionId, termId, status: { in: ['published', 'archived'] } }
            : { termId, status: 'published' },
          orderBy: { publishedAt: 'desc' },
        });
        if (query.versionId && candidates.length === 0) {
          throw new NotFoundException('We could not find this published timetable.');
        }

        // A term with several timetable scopes has one published version per scope: use the
        // newest one that has classes for `who`.
        let fallback: TimetableVersion | null = null;
        for (const version of candidates) {
          fallback ??= version;
          const subGroupSectionId =
            who.kind === 'subgroup'
              ? await this.subGroupSection(tx, version.snapshotId, who.id)
              : null;
          const rows = await tx.timetableSlot.findMany({
            where: { versionId: version.id, ...slotWhere(who, subGroupSectionId) },
          });
          if (rows.length > 0) {
            return TimetableReadResponseV1.parse(
              readResponse(storedVersion(version), rows.map(storedSlot), who, subGroupSectionId),
            );
          }
        }
        return TimetableReadResponseV1.parse(
          readResponse(fallback && storedVersion(fallback), [], who),
        );
      },
    );
  }

  /** The section of a sub-group, from the snapshot the version was built from. */
  private async subGroupSection(
    tx: TxClient,
    snapshotId: string,
    subGroupId: string,
  ): Promise<string | null> {
    const rows = await tx.$queryRaw<{ section_id: string }[]>`
      SELECT g->>'sectionId' AS section_id
        FROM timetable_snapshots s, jsonb_array_elements(s.data->'subGroups') g
       WHERE s.id = ${snapshotId}::uuid AND g->>'id' = ${subGroupId}`;
    return rows[0]?.section_id ?? null;
  }
}
