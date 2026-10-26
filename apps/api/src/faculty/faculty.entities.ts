import type { Prisma } from '@slotwise/db';
import { facultySchema, type FacultyInput, type FacultyRow } from '@slotwise/shared';
import { requireRefs, type EntityDef } from '../masterdata/entity';

export const facultyInclude = {
  departments: true,
  homeDepartment: { select: { code: true } },
  _count: { select: { unavailability: true } },
} satisfies Prisma.FacultyInclude;
export type FacultyDb = Prisma.FacultyGetPayload<{ include: typeof facultyInclude }>;

/** Faculty belong to their home department (ADR 0008). */
export const faculty: EntityDef<FacultyInput, FacultyDb, FacultyRow> = {
  name: 'faculty',
  path: 'faculty',
  manage: 'faculty.manage',
  resourceType: 'faculty',
  schema: facultySchema,
  model: (tx) => tx.faculty,
  include: facultyInclude,
  orderBy: [{ name: 'asc' }],
  listWhere: (q) => ({
    ...(q.departmentId
      ? {
          OR: [
            { homeDepartmentId: q.departmentId },
            { departments: { some: { departmentId: q.departmentId } } },
          ],
        }
      : {}),
    ...(q.q
      ? {
          AND: [
            {
              OR: [
                { name: { contains: q.q, mode: 'insensitive' } },
                { shortCode: { contains: q.q, mode: 'insensitive' } },
                { employeeCode: { contains: q.q, mode: 'insensitive' } },
              ],
            },
          ],
        }
      : {}),
  }),
  departmentOf: async (_ctx, values) => values.homeDepartmentId,
  async toData({ tx }, input) {
    await requireRefs([
      ['homeDepartmentId', tx.department, input.homeDepartmentId, 'Choose a department.'],
      ...input.departmentIds.map(
        (id) => ['departmentIds', tx.department, id, 'Choose departments from the list.'] as const,
      ),
    ]);
    const { departmentIds: _departmentIds, ...fields } = input;
    return { ...fields, shortCode: input.shortCode.toUpperCase() };
  },
  async afterWrite({ tx, tenant }, row, input) {
    await tx.facultyDepartment.deleteMany({ where: { facultyId: row.id } });
    await tx.facultyDepartment.createMany({
      data: [...new Set(input.departmentIds)]
        .filter((d) => d !== input.homeDepartmentId)
        .map((departmentId) => ({
          instituteId: tenant.institute.id,
          facultyId: row.id,
          departmentId,
        })),
    });
  },
  toInput: (row) => ({
    employeeCode: row.employeeCode,
    name: row.name,
    shortCode: row.shortCode,
    email: row.email,
    designation: row.designation,
    experience: row.experience,
    homeDepartmentId: row.homeDepartmentId,
    departmentIds: row.departments.map((d) => d.departmentId).sort(),
    maxPeriodsPerDay: row.maxPeriodsPerDay,
    maxPeriodsPerWeek: row.maxPeriodsPerWeek,
  }),
  extras: (row) => ({
    homeDepartmentCode: row.homeDepartment.code,
    userId: row.userId,
    unavailableCount: row._count.unavailability,
  }),
  duplicate: (target) =>
    target.includes('short_code') || target.includes('shortCode')
      ? 'Someone already has this short code. Pick another, e.g. add a letter.'
      : 'Someone already has this employee code.',
};
