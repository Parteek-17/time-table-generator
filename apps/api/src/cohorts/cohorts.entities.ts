/**
 * Batches, sections (with sub-groups), elective sections and students. Each belongs to the
 * department of its branch (ADR 0008).
 */
import type { Prisma, TxClient } from '@slotwise/db';
import {
  batchSchema,
  electiveSectionSchema,
  sectionSchema,
  studentSchema,
  type BatchInput,
  type BatchRow,
  type ElectiveSectionInput,
  type ElectiveSectionRow,
  type SectionInput,
  type SectionRow,
  type StudentInput,
  type StudentRow,
} from '@slotwise/shared';
import { fieldError, requireRefs, type EntityDef } from '../masterdata/entity';

const live = { deletedAt: null };

export async function branchDepartment(tx: TxClient, branchId: string): Promise<string | null> {
  const b = await tx.branch.findFirst({ where: { id: branchId }, select: { departmentId: true } });
  return b?.departmentId ?? null;
}

export async function cohortDepartment(tx: TxClient, cohortId: string): Promise<string | null> {
  const c = await tx.cohort.findFirst({
    where: { id: cohortId },
    select: { batch: { select: { branch: { select: { departmentId: true } } } } },
  });
  return c?.batch.branch.departmentId ?? null;
}

// ---- Batches -------------------------------------------------------------------------------

const batchInclude = {
  programme: { select: { code: true } },
  branch: { select: { code: true } },
  schemeVersion: { select: { name: true } },
} satisfies Prisma.BatchInclude;
type BatchDb = Prisma.BatchGetPayload<{ include: typeof batchInclude }>;

export const batches: EntityDef<BatchInput, BatchDb, BatchRow> = {
  name: 'batch',
  path: 'batches',
  manage: 'cohort.manage',
  resourceType: 'batch',
  schema: batchSchema,
  model: (tx) => tx.batch,
  include: batchInclude,
  orderBy: [{ programmeId: 'asc' }, { admissionYear: 'desc' }],
  listWhere: (q) => ({
    ...(q.programmeId ? { programmeId: q.programmeId } : {}),
    ...(q.departmentId ? { branch: { departmentId: q.departmentId } } : {}),
  }),
  departmentOf: ({ tx }, values) => branchDepartment(tx, values.branchId),
  async toData({ tx }, input) {
    await requireRefs([
      ['programmeId', tx.programme, input.programmeId, 'Choose a programme.'],
      [
        'branchId',
        tx.branch,
        input.branchId,
        'Choose a branch of this programme.',
        { programmeId: input.programmeId },
      ],
      [
        'schemeVersionId',
        tx.schemeVersion,
        input.schemeVersionId,
        'Choose a scheme of this programme.',
        { programmeId: input.programmeId },
      ],
    ]);
    if (input.entryType === 'lateral') {
      const p = await tx.programme.findFirstOrThrow({ where: { id: input.programmeId } });
      if (p.lateralEntrySemester == null)
        fieldError('entryType', `${p.name} has no lateral entry.`);
    }
    return { ...input };
  },
  toInput: (row) => ({
    programmeId: row.programmeId,
    branchId: row.branchId,
    admissionYear: row.admissionYear,
    entryType: row.entryType,
    schemeVersionId: row.schemeVersionId,
    status: row.status,
  }),
  extras: (row) => ({
    programmeCode: row.programme.code,
    branchCode: row.branch.code,
    schemeVersionName: row.schemeVersion.name,
  }),
  duplicate: () => 'This batch already exists for this branch, year and entry type.',
};

// ---- Sections ------------------------------------------------------------------------------

const sectionInclude = {
  subGroups: { where: live, orderBy: { name: 'asc' } },
} satisfies Prisma.SectionInclude;
type SectionDb = Prisma.SectionGetPayload<{ include: typeof sectionInclude }>;

/** Updates sub-groups by name: changed strengths, new ones, and archives the rest. */
export async function syncSubGroups(
  tx: TxClient,
  instituteId: string,
  sectionId: string,
  wanted: readonly { name: string; strength: number }[],
): Promise<void> {
  const existing = await tx.subGroup.findMany({ where: { sectionId } });
  const byName = new Map(existing.map((g) => [g.name.toLowerCase(), g]));
  for (const g of wanted) {
    const found = byName.get(g.name.toLowerCase());
    if (found) {
      await tx.subGroup.update({
        where: { id: found.id },
        data: { strength: g.strength, deletedAt: null },
      });
    } else {
      await tx.subGroup.create({
        data: { instituteId, sectionId, name: g.name, strength: g.strength },
      });
    }
  }
  const keep = new Set(wanted.map((g) => g.name.toLowerCase()));
  const drop = existing
    .filter((g) => !g.deletedAt && !keep.has(g.name.toLowerCase()))
    .map((g) => g.id);
  if (drop.length > 0) {
    await tx.subGroup.updateMany({ where: { id: { in: drop } }, data: { deletedAt: new Date() } });
  }
}

export const sections: EntityDef<SectionInput, SectionDb, SectionRow> = {
  name: 'section',
  path: 'sections',
  manage: 'cohort.manage',
  resourceType: 'section',
  schema: sectionSchema,
  model: (tx) => tx.section,
  include: sectionInclude,
  orderBy: [{ cohortId: 'asc' }, { name: 'asc' }],
  listWhere: (q) => ({
    ...(q.cohortId ? { cohortId: q.cohortId } : {}),
    ...(q.termId ? { cohort: { termId: q.termId } } : {}),
  }),
  departmentOf: ({ tx }, values) => cohortDepartment(tx, values.cohortId),
  async toData({ tx }, input, existing) {
    await requireRefs([
      ['cohortId', tx.cohort, input.cohortId, 'Choose a cohort.'],
      ['homeRoomId', tx.room, input.homeRoomId, 'Choose a room.'],
    ]);
    if (existing && existing.cohortId !== input.cohortId) {
      fieldError('cohortId', 'A section cannot move to another cohort.');
    }
    const cohort = await tx.cohort.findFirstOrThrow({ where: { id: input.cohortId } });
    if (cohort.joinsCohortId) {
      fieldError(
        'cohortId',
        'This cohort sits in another cohort’s sections. Add its students there.',
      );
    }
    return {
      cohortId: input.cohortId,
      name: input.name,
      displayName: input.displayName,
      strength: input.strength,
      homeRoomId: input.homeRoomId,
    };
  },
  afterWrite: ({ tx, tenant }, row, input) =>
    syncSubGroups(tx, tenant.institute.id, row.id, input.subGroups),
  toInput: (row) => ({
    cohortId: row.cohortId,
    name: row.name,
    displayName: row.displayName,
    strength: row.strength,
    homeRoomId: row.homeRoomId,
    subGroups: row.subGroups.map((g) => ({ name: g.name, strength: g.strength })),
  }),
  extras: (row) => ({
    subGroups: row.subGroups.map((g) => ({ id: g.id, name: g.name, strength: g.strength })),
  }),
  duplicate: () => 'This cohort already has a section with this name.',
};

// ---- Elective sections ---------------------------------------------------------------------

const electiveInclude = {
  sources: true,
  course: { select: { code: true, title: true } },
} satisfies Prisma.ElectiveSectionInclude;
type ElectiveDb = Prisma.ElectiveSectionGetPayload<{ include: typeof electiveInclude }>;

export const electiveSections: EntityDef<ElectiveSectionInput, ElectiveDb, ElectiveSectionRow> = {
  name: 'elective_section',
  path: 'elective-sections',
  manage: 'cohort.manage',
  resourceType: 'section',
  schema: electiveSectionSchema,
  model: (tx) => tx.electiveSection,
  include: electiveInclude,
  orderBy: [{ courseId: 'asc' }, { name: 'asc' }],
  listWhere: (q) => ({
    ...(q.termId ? { termId: q.termId } : {}),
    ...(q.cohortId ? { sources: { some: { section: { cohortId: q.cohortId } } } } : {}),
  }),
  /** The department of its source sections if they share one; else institute-owned (open electives). */
  async departmentOf({ tx }, values) {
    const rows = await tx.section.findMany({
      where: { id: { in: [...values.sourceSectionIds] } },
      select: {
        cohort: { select: { batch: { select: { branch: { select: { departmentId: true } } } } } },
      },
    });
    const depts = new Set(rows.map((r) => r.cohort.batch.branch.departmentId));
    return depts.size === 1 ? [...depts][0]! : null;
  },
  async toData({ tx }, input) {
    await requireRefs([
      ['termId', tx.term, input.termId, 'Choose a term.'],
      ['courseId', tx.course, input.courseId, 'Choose a course.'],
    ]);
    const found = await tx.section.count({
      where: { id: { in: input.sourceSectionIds }, cohort: { termId: input.termId }, ...live },
    });
    if (found !== new Set(input.sourceSectionIds).size) {
      fieldError('sourceSectionIds', 'Pick sections of this term.');
    }
    return {
      termId: input.termId,
      courseId: input.courseId,
      name: input.name,
      strength: input.strength,
    };
  },
  async afterWrite({ tx, tenant }, row, input) {
    await tx.electiveSectionSource.deleteMany({ where: { electiveSectionId: row.id } });
    await tx.electiveSectionSource.createMany({
      data: [...new Set(input.sourceSectionIds)].map((sectionId) => ({
        instituteId: tenant.institute.id,
        electiveSectionId: row.id,
        sectionId,
      })),
    });
  },
  toInput: (row) => ({
    termId: row.termId,
    courseId: row.courseId,
    name: row.name,
    strength: row.strength,
    sourceSectionIds: row.sources.map((s) => s.sectionId).sort(),
  }),
  extras: (row) => ({ courseCode: row.course.code, courseTitle: row.course.title }),
  duplicate: () => 'This course already has an elective section with this name in this term.',
};

// ---- Students ------------------------------------------------------------------------------

type StudentDb = Prisma.StudentGetPayload<object>;

export const students: EntityDef<StudentInput, StudentDb, StudentRow> = {
  name: 'student',
  path: 'students',
  manage: 'cohort.manage',
  resourceType: 'student',
  schema: studentSchema,
  model: (tx) => tx.student,
  orderBy: [{ classRollNo: 'asc' }],
  listWhere: (q) => ({
    ...(q.batchId ? { batchId: q.batchId } : {}),
    ...(q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' } },
            { classRollNo: { contains: q.q, mode: 'insensitive' } },
            { universityRollNo: { contains: q.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }),
  async departmentOf({ tx }, values) {
    const b = await tx.batch.findFirst({
      where: { id: values.batchId },
      select: { branchId: true },
    });
    return b ? branchDepartment(tx, b.branchId) : null;
  },
  async toData({ tx }, input) {
    await requireRefs([
      ['batchId', tx.batch, input.batchId, 'Choose a batch.'],
      [
        'sectionId',
        tx.section,
        input.sectionId,
        'Choose a section of this batch.',
        { cohort: { batchId: input.batchId } },
      ],
      [
        'subGroupId',
        tx.subGroup,
        input.subGroupId,
        'Choose a sub-group of this section.',
        { sectionId: input.sectionId ?? undefined },
      ],
    ]);
    if (input.subGroupId && !input.sectionId) fieldError('sectionId', 'Choose the section first.');
    return { ...input };
  },
  toInput: (row) => ({
    batchId: row.batchId,
    classRollNo: row.classRollNo,
    universityRollNo: row.universityRollNo,
    name: row.name,
    email: row.email,
    phone: row.phone,
    sectionId: row.sectionId,
    subGroupId: row.subGroupId,
    status: row.status,
  }),
  duplicate: () => 'A student with this class roll number already exists.',
};
