/**
 * Departments, programmes, branches, scheme versions and courses.
 * Ownership (ADR 0008): a programme belongs to its department (null for B.Tech-like
 * programmes that span departments: institute only); a branch and a scheme version to their
 * programme's department; a course to its branches' department, else its programme's.
 */
import type { Prisma } from '@slotwise/db';
import {
  branchSchema,
  courseSchema,
  credits,
  DEFAULT_BRANCH_CODE,
  departmentSchema,
  programmeSchema,
  schemeVersionSchema,
  type BranchInput,
  type BranchRow,
  type CourseInput,
  type CourseRow,
  type DepartmentInput,
  type DepartmentRow,
  type ProgrammeInput,
  type ProgrammeRow,
  type SchemeVersionInput,
  type SchemeVersionRow,
} from '@slotwise/shared';
import { fieldError, requireRefs, type EntityContext, type EntityDef } from '../masterdata/entity';

const live = { deletedAt: null };

// ---- Departments -------------------------------------------------------------------------

type DepartmentDb = Prisma.DepartmentGetPayload<object>;

export const departments: EntityDef<DepartmentInput, DepartmentDb, DepartmentRow> = {
  name: 'department',
  path: 'departments',
  manage: 'department.manage',
  resourceType: 'department',
  schema: departmentSchema,
  model: (tx) => tx.department,
  orderBy: { name: 'asc' },
  listWhere: (q) => (q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
  // Creating a department is institute-level; a hod may edit their own department.
  departmentOf: async (_ctx, _values, existing) => existing?.id ?? null,
  toData: async (_ctx, input) => ({
    code: input.code.toUpperCase(),
    name: input.name,
    kind: input.kind,
  }),
  toInput: (row) => ({ code: row.code, name: row.name, kind: row.kind }),
  duplicate: () => 'A department with this code already exists.',
};

// ---- Programmes --------------------------------------------------------------------------

export const programmeInclude = {
  department: { select: { code: true } },
  branches: {
    where: live,
    include: { department: { select: { code: true } } },
    orderBy: { code: 'asc' },
  },
} satisfies Prisma.ProgrammeInclude;
type ProgrammeDb = Prisma.ProgrammeGetPayload<{ include: typeof programmeInclude }>;
type BranchDb = Prisma.BranchGetPayload<{ include: { department: { select: { code: true } } } }>;

function branchDto(b: BranchDb): BranchRow {
  return {
    id: b.id,
    archivedAt: b.deletedAt?.toISOString() ?? null,
    programmeId: b.programmeId,
    code: b.code,
    name: b.name,
    departmentId: b.departmentId,
    isDefault: b.isDefault,
    departmentCode: b.department.code,
  };
}

export const programmes: EntityDef<ProgrammeInput, ProgrammeDb, ProgrammeRow> = {
  name: 'programme',
  path: 'programmes',
  manage: 'academics.manage',
  resourceType: 'programme',
  schema: programmeSchema,
  model: (tx) => tx.programme,
  include: programmeInclude,
  orderBy: { code: 'asc' },
  listWhere: (q) => (q.departmentId ? { departmentId: q.departmentId } : {}),
  departmentOf: async (_ctx, values) => values.departmentId,
  async toData({ tx }, input, existing) {
    await requireRefs([
      ['departmentId', tx.department, input.departmentId, 'Choose a department.'],
    ]);
    if (existing && input.lateralEntrySemester == null && existing.lateralEntrySemester != null) {
      const lateral = await tx.batch.count({
        where: { programmeId: existing.id, entryType: 'lateral', ...live },
      });
      if (lateral > 0)
        fieldError(
          'lateralEntrySemester',
          'Lateral-entry batches exist. Keep the lateral-entry semester.',
        );
    }
    return {
      code: input.code.toUpperCase(),
      name: input.name,
      level: input.level,
      mode: input.mode,
      totalSemesters: input.totalSemesters,
      lateralEntrySemester: input.lateralEntrySemester,
      departmentId: input.departmentId,
    };
  },
  async afterWrite({ tx, tenant }, row, input, created) {
    // Programmes without branches (MBA, BCA) get one default branch.
    if (created && !input.hasBranches && input.departmentId) {
      await tx.branch.create({
        data: {
          instituteId: tenant.institute.id,
          programmeId: row.id,
          code: DEFAULT_BRANCH_CODE,
          name: input.name,
          departmentId: input.departmentId,
          isDefault: true,
        },
      });
    }
  },
  toInput: (row) => ({
    code: row.code,
    name: row.name,
    level: row.level,
    mode: row.mode,
    totalSemesters: row.totalSemesters,
    lateralEntrySemester: row.lateralEntrySemester,
    departmentId: row.departmentId,
    hasBranches: !row.branches.some((b) => b.isDefault),
  }),
  extras: (row) => ({
    hasBranches: undefined,
    departmentCode: row.department?.code ?? null,
    branches: row.branches.map(branchDto),
  }),
  duplicate: () => 'A programme with this code already exists.',
};

async function programmeDepartment(
  ctx: EntityContext,
  programmeId: string,
): Promise<string | null> {
  const p = await ctx.tx.programme.findFirst({
    where: { id: programmeId },
    select: { departmentId: true },
  });
  return p?.departmentId ?? null;
}

// ---- Branches ----------------------------------------------------------------------------

export const branches: EntityDef<BranchInput, BranchDb, BranchRow> = {
  name: 'branch',
  path: 'branches',
  manage: 'academics.manage',
  resourceType: 'programme',
  schema: branchSchema,
  model: (tx) => tx.branch,
  include: { department: { select: { code: true } } },
  orderBy: [{ programmeId: 'asc' }, { code: 'asc' }],
  listWhere: (q) => (q.programmeId ? { programmeId: q.programmeId } : {}),
  departmentOf: (ctx, values) => programmeDepartment(ctx, values.programmeId),
  async toData({ tx }, input, existing) {
    await requireRefs([
      ['programmeId', tx.programme, input.programmeId, 'Choose a programme.'],
      ['departmentId', tx.department, input.departmentId, 'Choose a department.'],
    ]);
    if (existing && existing.programmeId !== input.programmeId) {
      fieldError(
        'programmeId',
        'A branch cannot move to another programme. Add a new branch instead.',
      );
    }
    return {
      programmeId: input.programmeId,
      code: input.code.toUpperCase(),
      name: input.name,
      departmentId: input.departmentId,
    };
  },
  toInput: (row) => ({
    programmeId: row.programmeId,
    code: row.code,
    name: row.name,
    departmentId: row.departmentId,
  }),
  extras: (row) => ({ isDefault: row.isDefault, departmentCode: row.department.code }),
  duplicate: () => 'This programme already has a branch with this code.',
};

// ---- Scheme versions ---------------------------------------------------------------------

const schemeInclude = {
  programme: { select: { code: true } },
  _count: { select: { courses: { where: live } } },
} satisfies Prisma.SchemeVersionInclude;
type SchemeDb = Prisma.SchemeVersionGetPayload<{ include: typeof schemeInclude }>;

export const schemeVersions: EntityDef<SchemeVersionInput, SchemeDb, SchemeVersionRow> = {
  name: 'scheme_version',
  path: 'scheme-versions',
  manage: 'academics.manage',
  resourceType: 'scheme',
  schema: schemeVersionSchema,
  model: (tx) => tx.schemeVersion,
  include: schemeInclude,
  orderBy: [{ programmeId: 'asc' }, { name: 'asc' }],
  listWhere: (q) => (q.programmeId ? { programmeId: q.programmeId } : {}),
  departmentOf: (ctx, values) => programmeDepartment(ctx, values.programmeId),
  async toData({ tx }, input, existing) {
    await requireRefs([['programmeId', tx.programme, input.programmeId, 'Choose a programme.']]);
    if (existing && existing.programmeId !== input.programmeId) {
      fieldError('programmeId', 'A scheme cannot move to another programme.');
    }
    return { programmeId: input.programmeId, name: input.name, status: input.status };
  },
  toInput: (row) => ({ programmeId: row.programmeId, name: row.name, status: row.status }),
  extras: (row) => ({ programmeCode: row.programme.code, courseCount: row._count.courses }),
  duplicate: () => 'This programme already has a scheme with this name.',
};

// ---- Courses -----------------------------------------------------------------------------

export const courseInclude = {
  branches: true,
  offeringDepartment: { select: { code: true } },
} satisfies Prisma.CourseInclude;
type CourseDb = Prisma.CourseGetPayload<{ include: typeof courseInclude }>;

export const courses: EntityDef<CourseInput, CourseDb, CourseRow> = {
  name: 'course',
  path: 'courses',
  manage: 'academics.manage',
  resourceType: 'course',
  schema: courseSchema,
  model: (tx) => tx.course,
  include: courseInclude,
  orderBy: [{ semester: 'asc' }, { code: 'asc' }],
  listWhere: (q) => ({
    ...(q.schemeVersionId ? { schemeVersionId: q.schemeVersionId } : {}),
    ...(q.semester ? { semester: q.semester } : {}),
    ...(q.departmentId ? { offeringDepartmentId: q.departmentId } : {}),
    ...(q.q
      ? {
          OR: [
            { code: { contains: q.q, mode: 'insensitive' } },
            { title: { contains: q.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }),
  async departmentOf({ tx }, values) {
    if (values.branchIds.length > 0) {
      const rows = await tx.branch.findMany({
        where: { id: { in: values.branchIds } },
        select: { departmentId: true },
      });
      const depts = new Set(rows.map((b) => b.departmentId));
      return depts.size === 1 ? [...depts][0]! : null;
    }
    const scheme = await tx.schemeVersion.findFirst({
      where: { id: values.schemeVersionId },
      select: { programme: { select: { departmentId: true } } },
    });
    return scheme?.programme.departmentId ?? null;
  },
  async toData({ tx }, input) {
    await requireRefs([
      ['schemeVersionId', tx.schemeVersion, input.schemeVersionId, 'Choose a scheme.'],
      ['offeringDepartmentId', tx.department, input.offeringDepartmentId, 'Choose a department.'],
    ]);
    const scheme = await tx.schemeVersion.findFirstOrThrow({
      where: { id: input.schemeVersionId },
      select: { programmeId: true, programme: { select: { totalSemesters: true } } },
    });
    if (input.semester > scheme.programme.totalSemesters) {
      fieldError('semester', `This programme has ${scheme.programme.totalSemesters} semesters.`);
    }
    const branchCount = await tx.branch.count({
      where: { id: { in: input.branchIds }, programmeId: scheme.programmeId, ...live },
    });
    if (branchCount !== new Set(input.branchIds).size) {
      fieldError('branchIds', 'Pick branches of this programme.');
    }
    const { branchIds: _branchIds, ...fields } = input;
    return { ...fields, code: input.code.toUpperCase() };
  },
  async afterWrite({ tx, tenant }, row, input) {
    await tx.courseBranch.deleteMany({ where: { courseId: row.id } });
    await tx.courseBranch.createMany({
      data: [...new Set(input.branchIds)].map((branchId) => ({
        instituteId: tenant.institute.id,
        courseId: row.id,
        branchId,
      })),
    });
  },
  toInput: (row) => ({
    schemeVersionId: row.schemeVersionId,
    semester: row.semester,
    code: row.code,
    title: row.title,
    shortName: row.shortName,
    lectures: row.lectures,
    tutorials: row.tutorials,
    practicals: row.practicals,
    creditsOverride: row.creditsOverride == null ? null : Number(row.creditsOverride),
    syllabusHours: row.syllabusHours,
    type: row.type,
    electiveGroup: row.electiveGroup,
    offeringDepartmentId: row.offeringDepartmentId,
    roomType: row.roomType,
    labCategory: row.labCategory,
    labBlockLength: row.labBlockLength,
    isScheduled: row.isScheduled,
    tutorialBy: row.tutorialBy,
    practicalBy: row.practicalBy,
    branchIds: row.branches.map((b) => b.branchId).sort(),
  }),
  extras: (row) => ({
    credits: credits({
      lectures: row.lectures,
      tutorials: row.tutorials,
      practicals: row.practicals,
      creditsOverride: row.creditsOverride == null ? null : Number(row.creditsOverride),
    }),
    offeringDepartmentCode: row.offeringDepartment.code,
  }),
  duplicate: () => 'This scheme already has a course with this code.',
};
