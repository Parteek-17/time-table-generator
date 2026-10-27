/**
 * Disruptions (holidays, events, faculty leave) and the classes they cancel (CLAUDE.md
 * "Rescheduling": holidays and events cancel overlapping classes for their scope).
 */
import { z } from 'zod';
import { Id, IsoDate, Minute, type TimetableSlotV1 } from '../contracts';
import {
  classDates,
  type RescheduleCalendar,
  type SectionPlace,
  type VersionWindow,
} from './calendar';
import { daysBetween } from './dates';

/** Kinds a coordinator can add now. room_unavailable (move, not cancel) comes later. */
export const DISRUPTION_KINDS = ['holiday', 'event', 'faculty_leave', 'other'] as const;
export type DisruptionKind = (typeof DISRUPTION_KINDS)[number];

export const DISRUPTION_SCOPES = ['institute', 'department', 'section'] as const;
export type DisruptionScope = (typeof DISRUPTION_SCOPES)[number];

/** Longest disruption one entry may cover; longer breaks belong in the setup calendar. */
export const MAX_DISRUPTION_DAYS = 31;

export const CreateDisruptionInput = z
  .object({
    kind: z.enum(DISRUPTION_KINDS),
    title: z.string().trim().min(2, 'Give it a short name, e.g. “Annual fest”.').max(120),
    scopeType: z.enum(DISRUPTION_SCOPES).default('institute'),
    departmentId: Id.nullable().default(null),
    sectionId: Id.nullable().default(null),
    facultyId: Id.nullable().default(null),
    startDate: IsoDate,
    endDate: IsoDate,
    /** Both null = the whole day. */
    startMinute: Minute.nullable().default(null),
    endMinute: Minute.nullable().default(null),
  })
  .superRefine((d, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (d.endDate < d.startDate) issue('endDate', 'The last day is before the first day.');
    else if (daysBetween(d.startDate, d.endDate) >= MAX_DISRUPTION_DAYS) {
      issue(
        'endDate',
        `Choose at most ${MAX_DISRUPTION_DAYS} days. Add longer breaks to the academic calendar.`,
      );
    }
    if ((d.startMinute === null) !== (d.endMinute === null)) {
      issue('endMinute', 'Give both a start and an end time, or neither for the whole day.');
    } else if (d.startMinute !== null && d.endMinute !== null && d.startMinute >= d.endMinute) {
      issue('endMinute', 'The end time is before the start time.');
    }
    if (d.scopeType === 'department' && !d.departmentId)
      issue('departmentId', 'Pick a department.');
    if (d.scopeType === 'section' && !d.sectionId) issue('sectionId', 'Pick a section.');
    if (d.kind === 'faculty_leave' && !d.facultyId)
      issue('facultyId', 'Pick the teacher on leave.');
  })
  .transform((d) => ({
    ...d,
    // Only the id the scope needs is kept.
    departmentId: d.scopeType === 'department' ? d.departmentId : null,
    sectionId: d.scopeType === 'section' ? d.sectionId : null,
    facultyId: d.kind === 'faculty_leave' ? d.facultyId : null,
  }));
export type CreateDisruptionInput = z.output<typeof CreateDisruptionInput>;
export type CreateDisruptionInputRaw = z.input<typeof CreateDisruptionInput>;

/** Cancel one class on one date by hand (no disruption). */
export const CancelClassInput = z.object({
  /** The section whose timetable the class is on (where the coordinator picked it). */
  sectionId: Id,
  slotId: Id,
  date: IsoDate,
  reason: z.string().trim().min(2, 'Say why, in a few words.').max(120),
});
export type CancelClassInput = z.infer<typeof CancelClassInput>;

/** Filters for the list of cancelled classes. */
export const CancellationsQuery = z
  .object({
    from: IsoDate.optional(),
    to: IsoDate.optional(),
    sectionId: Id.optional(),
    facultyId: Id.optional(),
  })
  .refine((q) => !(q.sectionId && q.facultyId), {
    message: 'Filter by a section or a teacher, not both.',
  });
export type CancellationsQuery = z.infer<typeof CancellationsQuery>;

/** What a disruption needs for matching classes. */
export type DisruptionMatch = Pick<
  CreateDisruptionInput,
  | 'kind'
  | 'scopeType'
  | 'departmentId'
  | 'sectionId'
  | 'facultyId'
  | 'startDate'
  | 'endDate'
  | 'startMinute'
  | 'endMinute'
>;

/** True if the class's audience or teacher is covered by the disruption. */
export function disruptionCoversSlot(
  d: DisruptionMatch,
  slot: Pick<TimetableSlotV1, 'sectionIds' | 'faculty'>,
  sections: ReadonlyMap<string, SectionPlace>,
): boolean {
  if (d.kind === 'faculty_leave') return slot.faculty.some((f) => f.id === d.facultyId);
  switch (d.scopeType) {
    case 'institute':
      return true;
    case 'department':
      // A class shared by several departments' sections stops if any of them is away.
      return slot.sectionIds.some((s) => sections.get(s)?.departmentId === d.departmentId);
    case 'section':
      return d.sectionId !== null && slot.sectionIds.includes(d.sectionId);
  }
}

/** True if the class's time overlaps the disruption's hours (always, for whole days). */
export function overlapsHours(
  d: Pick<DisruptionMatch, 'startMinute' | 'endMinute'>,
  slot: Pick<TimetableSlotV1, 'startMinute' | 'endMinute'>,
): boolean {
  if (d.startMinute === null || d.endMinute === null) return true;
  return slot.startMinute < d.endMinute && slot.endMinute > d.startMinute;
}

export interface ClassHit {
  slot: TimetableSlotV1;
  date: string;
}

/**
 * Every (class, date) the disruption cancels: classes of the published version that meet in
 * its dates and hours for its scope. Dates on setup holidays are left out (no class to cancel).
 * Sorted by date, then start time.
 */
export function classesHit(
  d: DisruptionMatch,
  slots: readonly TimetableSlotV1[],
  version: VersionWindow,
  cal: RescheduleCalendar,
): ClassHit[] {
  const hits: ClassHit[] = [];
  for (const slot of slots) {
    if (!disruptionCoversSlot(d, slot, cal.sections) || !overlapsHours(d, slot)) continue;
    for (const date of classDates(slot, d.startDate, d.endDate, version, cal)) {
      hits.push({ slot, date });
    }
  }
  return hits.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.slot.startMinute - b.slot.startMinute ||
      a.slot.id.localeCompare(b.slot.id),
  );
}

/** Sections a disruption reaches (for notices); null = everyone in the institute. */
export function disruptionSections(
  d: Pick<DisruptionMatch, 'scopeType' | 'departmentId' | 'sectionId'>,
  sections: ReadonlyMap<string, SectionPlace>,
): string[] | null {
  switch (d.scopeType) {
    case 'institute':
      return null;
    case 'department':
      return [...sections].filter(([, p]) => p.departmentId === d.departmentId).map(([id]) => id);
    case 'section':
      return d.sectionId ? [d.sectionId] : [];
  }
}
