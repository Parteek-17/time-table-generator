/** Buildings and rooms. Institute-owned: institute admins manage them (ADR 0008). */
import type { Prisma } from '@slotwise/db';
import {
  buildingSchema,
  classCapacity,
  roomSchema,
  type BuildingInput,
  type BuildingRow,
  type RoomInput,
  type RoomRow,
} from '@slotwise/shared';
import { requireRefs, type EntityDef } from '../masterdata/entity';

const institute = async () => null;

const buildingInclude = {
  _count: { select: { rooms: { where: { deletedAt: null } } } },
} satisfies Prisma.BuildingInclude;
type BuildingDb = Prisma.BuildingGetPayload<{ include: typeof buildingInclude }>;

export const buildings: EntityDef<BuildingInput, BuildingDb, BuildingRow> = {
  name: 'building',
  path: 'buildings',
  manage: 'infrastructure.manage',
  resourceType: 'room',
  schema: buildingSchema,
  model: (tx) => tx.building,
  include: buildingInclude,
  orderBy: { name: 'asc' },
  departmentOf: institute,
  toData: async (_ctx, input) => ({ ...input }),
  toInput: (row) => ({ name: row.name, code: row.code, floors: row.floors }),
  extras: (row) => ({ roomCount: row._count.rooms }),
  duplicate: () => 'A building with this name already exists.',
};

const roomInclude = { building: { select: { name: true } } } satisfies Prisma.RoomInclude;
type RoomDb = Prisma.RoomGetPayload<{ include: typeof roomInclude }>;

export const rooms: EntityDef<RoomInput, RoomDb, RoomRow> = {
  name: 'room',
  path: 'rooms',
  manage: 'infrastructure.manage',
  resourceType: 'room',
  schema: roomSchema,
  model: (tx) => tx.room,
  include: roomInclude,
  orderBy: [{ code: 'asc' }],
  listWhere: (q) => ({
    ...(q.departmentId ? { ownerDepartmentId: q.departmentId } : {}),
    ...(q.q ? { code: { contains: q.q, mode: 'insensitive' } } : {}),
  }),
  departmentOf: institute,
  async toData({ tx }, input) {
    await requireRefs([
      ['buildingId', tx.building, input.buildingId, 'Choose a building.'],
      ['ownerDepartmentId', tx.department, input.ownerDepartmentId, 'Choose a department.'],
    ]);
    const labCategories = [...new Set(input.labCategories.map((c) => c.trim()).filter(Boolean))];
    return { ...input, code: input.code.toUpperCase(), labCategories };
  },
  toInput: (row) => ({
    code: row.code,
    buildingId: row.buildingId,
    floor: row.floor,
    type: row.type,
    labCategories: row.labCategories,
    rows: row.rows,
    seatsPerRow: row.seatsPerRow,
    capacityOverride: row.capacityOverride,
    examSeatsPerBench: row.examSeatsPerBench,
    ownerDepartmentId: row.ownerDepartmentId,
    isShared: row.isShared,
    isAccessible: row.isAccessible,
  }),
  extras: (row) => ({ buildingName: row.building.name, classCapacity: classCapacity(row) }),
  duplicate: () => 'A room with this code already exists.',
};
