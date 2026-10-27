import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, TxClient } from '@slotwise/db';
import { can, canSomewhere } from '@slotwise/shared';
import type { SetupSnapshotV1, UnplacedSessionV1 } from '@slotwise/shared/contracts';
import {
  problemText,
  TimetableChecker,
  toSlotV1,
  type EditInput,
  type EditorDataDto,
  type EditorSlot,
  type EditRefusal,
  type EditResult,
  type StoredSlot,
} from '@slotwise/shared/timetable';
import type { Tenant } from '../common/request-context';
import { PrismaService } from '../db/prisma.service';
import { publishedBusySlots } from './busy';
import { tenantLong } from './tenant-tx';
import { storedSlot } from './timetable-read.service';

const NOT_ALLOWED = 'You don’t have permission to change these classes. Ask your institute admin.';
const NOT_A_DRAFT =
  'Published timetables can’t be changed. Make an editable copy first, then publish it.';

export type Version = Prisma.TimetableVersionGetPayload<{
  include: { snapshot: true; slots: true };
}>;

/** Departments of the cohorts a version covers ([null] when it names none). */
export function versionDepartments(version: Version): (string | null)[] {
  // Written only from a validated SetupSnapshotV1.
  const snapshot = version.snapshot.data as unknown as SetupSnapshotV1;
  const departments = [
    ...new Set(
      snapshot.cohorts.filter((c) => version.cohortIds.includes(c.id)).map((c) => c.departmentId),
    ),
  ];
  return departments.length ? departments : [null];
}

/**
 * A new draft with the same slots, locks and solver notes as `version`; its parent is the
 * original (CLAUDE.md: edits create a new draft; published versions never change).
 */
export async function copyVersionTx(tx: TxClient, version: Version, userId: string) {
  const draft = await tx.timetableVersion.create({
    data: {
      instituteId: version.instituteId,
      termId: version.termId,
      scopeId: version.scopeId,
      cohortIds: version.cohortIds,
      parentId: version.id,
      snapshotId: version.snapshotId,
      unplaced: version.unplaced ?? [],
      score: version.score ?? undefined,
      createdById: userId,
    },
  });
  await tx.timetableSlot.createMany({
    data: version.slots.map(
      ({ id: _id, versionId: _v, createdAt: _c, updatedAt: _u, faculty, ...rest }) => ({
        ...rest,
        faculty: faculty ?? [],
        versionId: draft.id,
      }),
    ),
  });
  return draft;
}

const editorSlot = (s: StoredSlot): EditorSlot => ({
  ...toSlotV1(s),
  sessionId: s.sessionId,
  locked: s.locked,
});

/**
 * Editing draft timetables: moves and locks checked by the shared TimetableChecker, editable
 * copies of published versions, and the data the editing screen needs.
 */
@Injectable()
export class TimetableEditService {
  constructor(private readonly prisma: PrismaService) {}

  private ctx(tenant: Tenant) {
    return { instituteId: tenant.institute.id, userId: tenant.user.id };
  }

  private place(tenant: Tenant) {
    return { id: tenant.institute.id, parentUniversityId: tenant.institute.parentUniversityId };
  }

  private async load(tx: TxClient, versionId: string): Promise<Version> {
    const version = await tx.timetableVersion.findUnique({
      where: { id: versionId },
      include: { snapshot: true, slots: true },
    });
    if (!version) throw new NotFoundException('We could not find this timetable.');
    return version;
  }

  private async checkerFor(tx: TxClient, version: Version) {
    // Written only from a validated SetupSnapshotV1.
    const snapshot = version.snapshot.data as unknown as SetupSnapshotV1;
    const busy = await publishedBusySlots(
      tx,
      version.termId,
      version.scopeId,
      new Set(snapshot.sections.map((s) => s.id)),
    );
    const slots = version.slots.map((s) => editorSlot(storedSlot(s)));
    return { snapshot, busy, slots, checker: new TimetableChecker(snapshot, slots, busy) };
  }

  private mayEdit(tenant: Tenant, departmentId: string | null): boolean {
    return can(tenant.authUser, 'timetable.edit', {
      type: 'timetable',
      instituteId: tenant.institute.id,
      departmentId,
    });
  }

  async editor(tenant: Tenant, versionId: string): Promise<EditorDataDto> {
    if (!canSomewhere(tenant.authUser, 'timetable.edit', this.place(tenant))) {
      throw new ForbiddenException(NOT_ALLOWED);
    }
    return this.prisma.tenant(this.ctx(tenant), async (tx) => {
      const version = await this.load(tx, versionId);
      const { snapshot, busy, slots } = await this.checkerFor(tx, version);
      const unplaced = (version.unplaced ?? []) as unknown as UnplacedSessionV1[];
      return {
        version: {
          id: version.id,
          termId: version.termId,
          scopeId: version.scopeId,
          status: version.status,
          number: version.number,
          parentId: version.parentId,
          solveJobId: version.solveJobId,
          slotCount: version.slots.length,
          unplacedCount: unplaced.length,
          createdAt: version.createdAt.toISOString(),
          publishedAt: version.publishedAt?.toISOString() ?? null,
        },
        snapshot,
        slots,
        busy,
        unplaced,
      };
    });
  }

  /** One move or lock on a draft. Refused moves answer 409 with the reasons. */
  async edit(tenant: Tenant, versionId: string, input: EditInput): Promise<EditResult> {
    return this.prisma.tenant(this.ctx(tenant), async (tx) => {
      const version = await this.load(tx, versionId);
      if (version.status !== 'draft') throw new ConflictException(NOT_A_DRAFT);
      const { checker } = await this.checkerFor(tx, version);
      const slot = checker.slot(input.slotId);
      if (!slot) throw new NotFoundException('This class is not in this timetable.');
      if (!this.mayEdit(tenant, checker.departmentOf(slot.id))) {
        throw new ForbiddenException(NOT_ALLOWED);
      }

      if (input.type === 'lock') {
        const row = await tx.timetableSlot.update({
          where: { id: slot.id },
          data: { locked: input.locked },
        });
        return { slot: editorSlot(storedSlot(row)), roomChanged: false };
      }

      const to = { weekday: input.weekday, startPeriodIndex: input.startPeriodIndex };
      const plan = checker.plan(slot.id, to, input.roomId);
      if (!plan.ok) {
        const refusal: EditRefusal = {
          statusCode: 409,
          message: problemText(plan.problems[0]!),
          problems: plan.problems,
        };
        throw new ConflictException(refusal);
      }
      const times = checker.times(slot.id, to.startPeriodIndex)!;
      const row = await tx.timetableSlot.update({
        where: { id: slot.id },
        data: {
          weekday: to.weekday,
          startPeriod: to.startPeriodIndex,
          ...times,
          roomId: plan.roomId,
          roomCode: plan.roomCode,
        },
      });
      return { slot: editorSlot(storedSlot(row)), roomChanged: plan.roomChanged };
    });
  }

  /**
   * An editable copy of a version (CLAUDE.md: edits create a new draft; published versions
   * never change). Same slots, locks and solver notes; its parent is the original.
   */
  async copy(tenant: Tenant, versionId: string): Promise<{ versionId: string }> {
    return tenantLong(this.prisma, this.ctx(tenant), async (tx) => {
      const version = await this.load(tx, versionId);
      if (!versionDepartments(version).every((d) => this.mayEdit(tenant, d))) {
        throw new ForbiddenException(NOT_ALLOWED);
      }
      const draft = await copyVersionTx(tx, version, tenant.user.id);
      return { versionId: draft.id };
    });
  }
}
