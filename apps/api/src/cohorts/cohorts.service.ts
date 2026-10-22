import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, TxClient } from '@slotwise/db';
import {
  defaultCohortCode,
  nextTerm,
  promotePreview,
  sectionNames,
  semesterFor,
  splitEvenly,
  subGroupNames,
  type CohortRow,
  type CohortUpdateInput,
  type GenerateCohortsResultDto,
  type PromoteInput,
  type PromotePreviewDto,
  type PromoteResultDto,
  type PromoteSourceCohort,
  type SectionBulkInput,
  type SectionRow,
} from '@slotwise/shared';
import type { Tenant } from '../common/request-context';
import { fieldError, type EntityContext } from '../masterdata/entity';
import { MasterDataService } from '../masterdata/masterdata.service';
import { cohortDepartment } from './cohorts.entities';

const live = { deletedAt: null };

const cohortInclude = {
  batch: { include: { programme: true, branch: true } },
  sections: { where: live, select: { strength: true } },
} satisfies Prisma.CohortInclude;
type CohortDb = Prisma.CohortGetPayload<{ include: typeof cohortInclude }>;

function cohortDto(c: CohortDb): CohortRow {
  return {
    id: c.id,
    archivedAt: c.deletedAt?.toISOString() ?? null,
    termId: c.termId,
    batchId: c.batchId,
    semester: c.semester,
    semesterOverridden: c.semesterOverridden,
    isRunning: c.isRunning,
    displayCode: c.displayCode,
    joinsCohortId: c.joinsCohortId,
    programmeId: c.batch.programmeId,
    programmeCode: c.batch.programme.code,
    branchId: c.batch.branchId,
    branchCode: c.batch.branch.code,
    departmentId: c.batch.branch.departmentId,
    admissionYear: c.batch.admissionYear,
    entryType: c.batch.entryType,
    schemeVersionId: c.batch.schemeVersionId,
    sectionCount: c.sections.length,
    strength: c.sections.reduce((a, s) => a + s.strength, 0),
  };
}

@Injectable()
export class CohortsService {
  constructor(private readonly md: MasterDataService) {}

  list(tenant: Tenant, termId: string | undefined): Promise<CohortRow[]> {
    return this.md.run(tenant, async ({ tx }) => {
      const rows = await tx.cohort.findMany({
        where: { ...live, ...(termId ? { termId } : {}) },
        include: cohortInclude,
        orderBy: [
          { batch: { programme: { code: 'asc' } } },
          { semester: 'asc' },
          { displayCode: 'asc' },
        ],
      });
      return rows.map(cohortDto);
    });
  }

  get(tenant: Tenant, id: string): Promise<CohortRow> {
    return this.md.run(tenant, async ({ tx }) => cohortDto(await this.find(tx, id)));
  }

  /** Semester override, running toggle, display code, joining another cohort's sections. */
  update(tenant: Tenant, id: string, input: CohortUpdateInput): Promise<CohortRow> {
    return this.md.run(tenant, async (ctx) => {
      const { tx } = ctx;
      const cohort = await this.find(tx, id);
      const dept = cohort.batch.branch.departmentId;
      this.md.assertCan(tenant, 'cohort.manage', this.md.resource(tenant, 'cohort', dept));
      if (input.semester > cohort.batch.programme.totalSemesters) {
        fieldError(
          'semester',
          `${cohort.batch.programme.name} has ${cohort.batch.programme.totalSemesters} semesters.`,
        );
      }
      if (input.joinsCohortId) {
        if (input.joinsCohortId === id) fieldError('joinsCohortId', 'A cohort cannot join itself.');
        const host = await tx.cohort.findFirst({
          where: { id: input.joinsCohortId, termId: cohort.termId, ...live },
        });
        if (!host) fieldError('joinsCohortId', 'Choose a cohort of the same term.');
        if (host.joinsCohortId)
          fieldError('joinsCohortId', 'That cohort itself sits in other sections.');
        const ownSections = await tx.section.count({ where: { cohortId: id, ...live } });
        if (ownSections > 0)
          fieldError('joinsCohortId', 'Archive this cohort’s own sections first.');
      }
      const term = await tx.term.findFirstOrThrow({
        where: { id: cohort.termId },
        include: { session: true },
      });
      const derived = semesterFor(cohort.batch, cohort.batch.programme, {
        sessionStartYear: term.session.startYear,
        kind: term.kind,
      });
      const before = cohortDto(cohort);
      await tx.cohort.update({
        where: { id },
        data: {
          semester: input.semester,
          semesterOverridden: input.semester !== derived,
          isRunning: input.isRunning,
          displayCode: input.displayCode,
          joinsCohortId: input.joinsCohortId,
        },
      });
      const after = cohortDto(await this.find(tx, id));
      await this.md.audit(ctx, 'cohort.updated', 'cohort', id, {
        changes: diffOf(before, after, ['semester', 'isRunning', 'displayCode', 'joinsCohortId']),
      });
      return after;
    });
  }

  /** Creates this term's cohorts for every active batch that has a running semester. */
  generate(tenant: Tenant, termId: string): Promise<GenerateCohortsResultDto> {
    return this.md.run(tenant, async (ctx) => {
      const { tx } = ctx;
      this.md.assertCan(tenant, 'term.manage', this.md.resource(tenant, 'term', null));
      const term = await tx.term.findFirst({
        where: { id: termId, ...live },
        include: { session: true },
      });
      if (!term) throw new NotFoundException('We could not find this term.');
      const batches = await tx.batch.findMany({
        where: { status: 'active', ...live },
        include: { programme: true, branch: true },
        orderBy: [{ entryType: 'asc' }, { admissionYear: 'desc' }],
      });
      const existing = new Set(
        (await tx.cohort.findMany({ where: { termId }, select: { batchId: true } })).map(
          (c) => c.batchId,
        ),
      );
      const result = { created: 0, existing: 0, notRunning: 0 };
      const ref = { sessionStartYear: term.session.startYear, kind: term.kind };
      for (const b of batches) {
        if (existing.has(b.id)) {
          result.existing++;
          continue;
        }
        const semester = semesterFor(b, b.programme, ref);
        if (semester == null) {
          result.notRunning++;
          continue;
        }
        // Lateral entry sits in the regular cohort of the same branch and semester, if any.
        const host =
          b.entryType === 'lateral'
            ? await tx.cohort.findFirst({
                where: {
                  termId,
                  semester,
                  joinsCohortId: null,
                  batch: { branchId: b.branchId, entryType: 'regular' },
                  ...live,
                },
              })
            : null;
        const created = await tx.cohort.create({
          data: {
            instituteId: tenant.institute.id,
            batchId: b.id,
            termId,
            semester,
            joinsCohortId: host?.id ?? null,
            displayCode: defaultCohortCode({
              programmeCode: b.programme.code,
              programmeLevel: b.programme.level,
              branchCode: b.branch.code,
              isDefaultBranch: b.branch.isDefault,
              semester,
              entryType: b.entryType,
            }),
          },
        });
        result.created++;
        await this.md.audit(ctx, 'cohort.created', 'cohort', created.id, {
          batchId: b.id,
          semester,
        });
      }
      return result;
    });
  }

  /** "Make 6 sections of 60, 2 sub-groups each." Names continue after existing sections. */
  addSections(tenant: Tenant, cohortId: string, input: SectionBulkInput): Promise<SectionRow[]> {
    return this.md.run(tenant, async (ctx) => {
      const { tx } = ctx;
      const cohort = await this.find(tx, cohortId);
      this.md.assertCan(
        tenant,
        'cohort.manage',
        this.md.resource(tenant, 'section', cohort.batch.branch.departmentId),
      );
      if (cohort.joinsCohortId) {
        throw new BadRequestException(
          'This cohort sits in another cohort’s sections. Add sections there.',
        );
      }
      const taken = new Set(
        (await tx.section.findMany({ where: { cohortId }, select: { name: true } })).map(
          (s) => s.name,
        ),
      );
      const names = sectionNames(taken.size + input.count)
        .filter((n) => !taken.has(n))
        .slice(0, input.count);
      const created: SectionRow[] = [];
      for (const name of names) {
        const section = await tx.section.create({
          data: {
            instituteId: tenant.institute.id,
            cohortId,
            name,
            displayName: `${input.prefix} ${name}`,
            strength: input.strength,
          },
        });
        const strengths = splitEvenly(input.strength, input.subGroupsPerSection);
        const subGroups = subGroupNames(name, input.subGroupsPerSection).map((sg, i) => ({
          name: sg,
          strength: strengths[i]!,
        }));
        await tx.subGroup.createMany({
          data: subGroups.map((g) => ({
            instituteId: tenant.institute.id,
            sectionId: section.id,
            ...g,
          })),
        });
        await this.md.audit(ctx, 'section.created', 'section', section.id, {
          after: { name, displayName: section.displayName, strength: input.strength, subGroups },
        });
        const withGroups = await tx.subGroup.findMany({
          where: { sectionId: section.id },
          orderBy: { name: 'asc' },
        });
        created.push({
          id: section.id,
          archivedAt: null,
          cohortId,
          name,
          displayName: section.displayName,
          strength: section.strength,
          homeRoomId: null,
          subGroups: withGroups.map((g) => ({ id: g.id, name: g.name, strength: g.strength })),
        });
      }
      return created;
    });
  }

  // ---- Promote batches --------------------------------------------------------------------

  preview(tenant: Tenant, fromTermId: string, toTermId: string): Promise<PromotePreviewDto> {
    return this.md.run(tenant, async (ctx) => {
      this.md.assertCan(tenant, 'term.manage', this.md.resource(tenant, 'term', null));
      const { sources, alreadyPromoted } = await this.promoteSources(ctx, fromTermId, toTermId);
      return { fromTermId, toTermId, rows: promotePreview(sources, alreadyPromoted) };
    });
  }

  promote(tenant: Tenant, fromTermId: string, input: PromoteInput): Promise<PromoteResultDto> {
    return this.md.run(tenant, async (ctx) => {
      const { tx } = ctx;
      this.md.assertCan(tenant, 'term.manage', this.md.resource(tenant, 'term', null));
      const { sources, alreadyPromoted, homeRooms } = await this.promoteSources(
        ctx,
        fromTermId,
        input.toTermId,
      );
      const rows = promotePreview(sources, alreadyPromoted);
      const skip = new Set(input.skipBatchIds);
      const result: PromoteResultDto = { created: 0, graduated: 0, skipped: 0 };
      const newCohortByBatch = new Map<string, string>();
      const instituteId = tenant.institute.id;

      for (const row of rows) {
        if (skip.has(row.batchId) || row.action === 'already_exists') {
          result.skipped++;
          continue;
        }
        if (row.action === 'graduate') {
          await tx.batch.update({ where: { id: row.batchId }, data: { status: 'graduated' } });
          await this.md.audit(ctx, 'batch.graduated', 'batch', row.batchId, {
            fromSemester: row.fromSemester,
          });
          result.graduated++;
          continue;
        }
        const cohort = await tx.cohort.create({
          data: {
            instituteId,
            batchId: row.batchId,
            termId: input.toTermId,
            semester: row.toSemester!,
            displayCode: row.toDisplayCode!,
          },
        });
        newCohortByBatch.set(row.batchId, cohort.id);
        for (const s of row.sections) {
          const section = await tx.section.create({
            data: {
              instituteId,
              cohortId: cohort.id,
              name: s.name,
              displayName: s.displayName,
              strength: s.strength,
              homeRoomId: s.homeRoomId && homeRooms.has(s.homeRoomId) ? s.homeRoomId : null,
            },
          });
          await tx.subGroup.createMany({
            data: s.subGroups.map((g) => ({
              instituteId,
              sectionId: section.id,
              name: g.name,
              strength: g.strength,
            })),
          });
        }
        await this.md.audit(ctx, 'cohort.created', 'cohort', cohort.id, {
          promotedFrom: row.fromCohortId,
          semester: row.toSemester,
          sections: row.sections.length,
        });
        result.created++;
      }
      // Lateral-entry cohorts keep sitting in the same (now promoted) regular batch.
      for (const row of rows) {
        const own = newCohortByBatch.get(row.batchId);
        const host = row.joinsBatchId ? newCohortByBatch.get(row.joinsBatchId) : undefined;
        if (own && host)
          await tx.cohort.update({ where: { id: own }, data: { joinsCohortId: host } });
      }
      await this.md.audit(ctx, 'batches.promoted', 'term', input.toTermId, {
        fromTermId,
        ...result,
      });
      return result;
    });
  }

  private async promoteSources(
    { tx }: EntityContext,
    fromTermId: string,
    toTermId: string,
  ): Promise<{
    sources: PromoteSourceCohort[];
    alreadyPromoted: Set<string>;
    homeRooms: Set<string>;
  }> {
    const [from, to] = await Promise.all(
      [fromTermId, toTermId].map((id) =>
        tx.term.findFirst({ where: { id, ...live }, include: { session: true } }),
      ),
    );
    if (!from || !to) throw new NotFoundException('We could not find this term.');
    if (from.status !== 'closed') {
      throw new BadRequestException(`Close ${from.label} first, then promote its batches.`);
    }
    const expected = nextTerm({ sessionStartYear: from.session.startYear, kind: from.kind });
    if (to.session.startYear !== expected.sessionStartYear || to.kind !== expected.kind) {
      fieldError('toTermId', `Pick the term right after ${from.label}.`);
    }
    const cohorts = await tx.cohort.findMany({
      where: { termId: fromTermId, ...live, batch: { status: 'active', ...live } },
      include: {
        batch: { include: { programme: true, branch: true } },
        joinsCohort: { select: { batchId: true } },
        sections: {
          where: live,
          include: { subGroups: { where: live, orderBy: { name: 'asc' } } },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: [{ semester: 'asc' }, { displayCode: 'asc' }],
    });
    const alreadyPromoted = new Set(
      (await tx.cohort.findMany({ where: { termId: toTermId }, select: { batchId: true } })).map(
        (c) => c.batchId,
      ),
    );
    const homeRooms = new Set(
      (await tx.room.findMany({ where: live, select: { id: true } })).map((r) => r.id),
    );
    const sources: PromoteSourceCohort[] = cohorts.map((c) => ({
      cohortId: c.id,
      batchId: c.batchId,
      displayCode: c.displayCode,
      semester: c.semester,
      joinsBatchId: c.joinsCohort?.batchId ?? null,
      entryType: c.batch.entryType,
      totalSemesters: c.batch.programme.totalSemesters,
      programmeCode: c.batch.programme.code,
      programmeLevel: c.batch.programme.level,
      branchCode: c.batch.branch.code,
      isDefaultBranch: c.batch.branch.isDefault,
      sections: c.sections.map((s) => ({
        name: s.name,
        displayName: s.displayName,
        strength: s.strength,
        homeRoomId: s.homeRoomId,
        subGroups: s.subGroups.map((g) => ({ name: g.name, strength: g.strength })),
      })),
    }));
    return { sources, alreadyPromoted, homeRooms };
  }

  private async find(tx: TxClient, id: string): Promise<CohortDb> {
    const cohort = await tx.cohort.findFirst({ where: { id, ...live }, include: cohortInclude });
    if (!cohort) throw new NotFoundException('We could not find this cohort.');
    return cohort;
  }

  /** Department of a cohort, for callers outside this service. */
  department(tx: TxClient, cohortId: string): Promise<string | null> {
    return cohortDepartment(tx, cohortId);
  }
}

function diffOf<T extends object>(before: T, after: T, keys: (keyof T)[]): Prisma.InputJsonObject {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of keys) {
    if (before[k] !== after[k]) out[String(k)] = { from: before[k] ?? null, to: after[k] ?? null };
  }
  return JSON.parse(JSON.stringify(out)) as Prisma.InputJsonObject;
}
