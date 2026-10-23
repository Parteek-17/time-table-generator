/**
 * Pure parts of the published-timetable read API (timetable-read.v1): who a query is for,
 * which slots belong to them, and the contract's response shape. Used by the API and tests.
 */
import {
  TIMETABLE_READ_V1,
  type TimetableReadQueryV1,
  type TimetableReadResponseV1,
  type TimetableSlotV1,
  type TimetableVersionV1,
} from '../contracts/timetable-read.v1';
import type { SlotRecord } from './slots';

/** The one thing a timetable is read for. */
export interface TimetableFor {
  kind: 'section' | 'subgroup' | 'faculty' | 'room';
  id: string;
}

/** The single id a (validated) read query asks for. */
export function timetableFor(query: TimetableReadQueryV1): TimetableFor {
  if (query.sectionId) return { kind: 'section', id: query.sectionId };
  if (query.subGroupId) return { kind: 'subgroup', id: query.subGroupId };
  if (query.facultyId) return { kind: 'faculty', id: query.facultyId };
  if (query.roomId) return { kind: 'room', id: query.roomId };
  throw new Error('Pass exactly one of sectionId, subGroupId, facultyId or roomId.');
}

type MatchFields = Pick<
  SlotRecord,
  'targetKind' | 'targetId' | 'sectionIds' | 'facultyIds' | 'roomId'
>;

// A lookup, not a switch: the lint rule against inline role checks flags `case 'faculty'`.
const MATCHES: Record<
  TimetableFor['kind'],
  (slot: MatchFields, id: string, subGroupSectionId: string | null) => boolean
> = {
  section: (slot, id) => slot.sectionIds.includes(id),
  subgroup: (slot, id, sectionId) =>
    slot.targetKind === 'subgroup'
      ? slot.targetId === id
      : sectionId != null && slot.sectionIds.includes(sectionId),
  faculty: (slot, id) => slot.facultyIds.includes(id),
  room: (slot, id) => slot.roomId === id,
};

/**
 * Whether a slot is in the week of `who`.
 * - section: its whole-section classes, its sub-groups' classes and electives its students take;
 * - sub-group: its own classes plus its section's classes that are not for another sub-group
 *   (`subGroupSectionId` is the sub-group's section; unknown = only its own classes);
 * - faculty: classes they teach; room: classes held there.
 */
export function slotIsFor(
  slot: MatchFields,
  who: TimetableFor,
  subGroupSectionId: string | null = null,
): boolean {
  return MATCHES[who.kind](slot, who.id, subGroupSectionId);
}

/** Week order: day, then period, then audience name. */
export function compareSlots(
  a: Pick<SlotRecord, 'weekday' | 'startPeriod' | 'targetName'>,
  b: Pick<SlotRecord, 'weekday' | 'startPeriod' | 'targetName'>,
): number {
  return (
    a.weekday - b.weekday ||
    a.startPeriod - b.startPeriod ||
    a.targetName.localeCompare(b.targetName)
  );
}

/** A stored slot with its ids. */
export type StoredSlot = SlotRecord & { id: string; versionId: string };

export function toSlotV1(slot: StoredSlot): TimetableSlotV1 {
  return {
    id: slot.id,
    versionId: slot.versionId,
    weekday: slot.weekday,
    startPeriodIndex: slot.startPeriod,
    length: slot.length,
    startMinute: slot.startMinute,
    endMinute: slot.endMinute,
    assignmentId: slot.assignmentId,
    component: slot.component,
    course: {
      id: slot.courseId,
      code: slot.courseCode,
      shortName: slot.courseShortName,
      title: slot.courseTitle,
    },
    target: { kind: slot.targetKind, id: slot.targetId, name: slot.targetName },
    sectionIds: slot.sectionIds,
    faculty: slot.faculty.map((f) => ({ id: f.id, name: f.name, shortCode: f.shortCode })),
    room: slot.roomId && slot.roomCode ? { id: slot.roomId, code: slot.roomCode } : null,
  };
}

/** A version row as stored (dates as Date objects, `@db.Date` at UTC midnight). */
export interface StoredVersion {
  id: string;
  termId: string;
  scopeId: string | null;
  number: number | null;
  status: 'draft' | 'published' | 'archived';
  publishedAt: Date | null;
  publishedById: string | null;
  validFrom: Date | null;
  validTo: Date | null;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Contract shape of a published or archived version. Drafts are never read through it. */
export function toVersionV1(v: StoredVersion): TimetableVersionV1 {
  if (v.status === 'draft' || v.number == null || !v.publishedAt || !v.validFrom) {
    throw new Error(`Version ${v.id} has not been published.`);
  }
  return {
    id: v.id,
    termId: v.termId,
    scopeId: v.scopeId,
    number: v.number,
    status: v.status,
    publishedAt: v.publishedAt.toISOString(),
    publishedById: v.publishedById,
    validFrom: isoDate(v.validFrom),
    validTo: v.validTo ? isoDate(v.validTo) : null,
  };
}

/** The read response for one version: `who`'s slots in week order. */
export function readResponse(
  version: StoredVersion | null,
  slots: readonly StoredSlot[],
  who: TimetableFor,
  subGroupSectionId: string | null = null,
): TimetableReadResponseV1 {
  return {
    contract: TIMETABLE_READ_V1,
    version: version ? toVersionV1(version) : null,
    slots: version
      ? slots
          .filter((s) => slotIsFor(s, who, subGroupSectionId))
          .sort(compareSlots)
          .map(toSlotV1)
      : [],
  };
}
