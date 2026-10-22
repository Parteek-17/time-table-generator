/**
 * Building blocks shared by the v1 contracts. Frozen once merged (docs/coordination/CONTRACTS.md):
 * a change is a new `common.v2.ts`, never an edit here.
 */
import { z } from 'zod';

/** Database id (uuid). */
export const Id = z.uuid();

/** Calendar date without a time zone, `YYYY-MM-DD` (CLAUDE.md: dates as `date`). */
export const IsoDate = z.iso.date();

/** Instant in UTC, ISO 8601 with offset, e.g. `2026-10-22T09:30:00.000Z`. */
export const IsoDateTime = z.iso.datetime({ offset: true });

/** Minutes from midnight in the institute's time zone (CLAUDE.md: times as ints). 0..1440. */
export const Minute = z.int().min(0).max(1440);

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export const Weekday = z.int().min(1).max(7);

/** Period number in a bell schedule, 1-based (P1 = 1). */
export const PeriodIndex = z.int().min(1);

/** Non-negative whole number. */
export const Count = z.int().min(0);

export const COMPONENTS_V1 = ['lecture', 'tutorial', 'practical'] as const;
/** Part of a course's weekly L-T-P: lecture (L), tutorial (T) or practical (P). */
export const ComponentV1 = z.enum(COMPONENTS_V1);

export const ROOM_TYPES_V1 = [
  'lecture',
  'tutorial',
  'lab',
  'seminar',
  'drawing_hall',
  'workshop',
] as const;
export const RoomTypeV1 = z.enum(ROOM_TYPES_V1);

/** Who a class is for: a whole section, one sub-group (lab batch) or an elective section. */
export const TargetKindV1 = z.enum(['section', 'subgroup', 'elective_section']);

/** A class's audience by kind and id. */
export const TargetRefV1 = z.object({
  /** section, subgroup or elective_section. */
  kind: TargetKindV1,
  /** Id of the section, sub-group or elective section. */
  id: Id,
});

export const SCOPE_TYPES_V1 = [
  'institute',
  'department',
  'programme',
  'cohort',
  'section',
] as const;

/**
 * Where a holiday, calendar window, extra working day or fixed slot applies. `scopeType` says
 * which one of the ids is set; the others are null.
 */
export const ScopeV1 = z.object({
  /** institute = everyone; otherwise the matching id below is set. */
  scopeType: z.enum(SCOPE_TYPES_V1),
  /** Set when scopeType is department. */
  departmentId: Id.nullable(),
  /** Set when scopeType is programme. */
  programmeId: Id.nullable(),
  /** Set when scopeType is cohort. */
  cohortId: Id.nullable(),
  /** Set when scopeType is section. */
  sectionId: Id.nullable(),
});

/** One (weekday, period) cell of the weekly grid. */
export const CellV1 = z.object({
  /** ISO weekday, 1 = Monday. */
  weekday: Weekday,
  /** 1-based period number. */
  periodIndex: PeriodIndex,
});

export type TargetRefV1 = z.infer<typeof TargetRefV1>;
export type ScopeV1 = z.infer<typeof ScopeV1>;
export type CellV1 = z.infer<typeof CellV1>;
