/**
 * The timetable screen's data: one version's week for one section, sub-group, teacher or room,
 * with the bell schedule to draw it and the lists to pick another. Built from the version's own
 * snapshot, so drafts and published versions look the same.
 */
import { z } from 'zod';
import type { SetupSnapshotV1 } from '../contracts/setup-snapshot.v1';
import type { TimetableSlotV1 } from '../contracts/timetable-read.v1';
import { bellScheduleFor } from '../domain/readiness';
import type { VersionSummaryDto } from './generate';
import type { GridBell } from './grid';
import { compareSlots, slotIsFor, toSlotV1, type StoredSlot, type TimetableFor } from './read';
import { subGroupSections, targetNames } from './slots';

export const VIEW_KINDS = ['section', 'subgroup', 'faculty', 'room'] as const;
export type ViewKind = (typeof VIEW_KINDS)[number];

/** `GET /timetable/versions/:versionId/view?kind=&id=`; missing = the first section. */
export const TimetableViewQuery = z.object({
  kind: z.enum(VIEW_KINDS).optional(),
  id: z.uuid().optional(),
});
export type TimetableViewQuery = z.infer<typeof TimetableViewQuery>;

export interface ViewChoice {
  id: string;
  name: string;
}

export type ViewSlot = TimetableSlotV1 & { locked: boolean };

export interface TimetableViewDto {
  version: VersionSummaryDto & { validFrom: string | null };
  /** Who the week is for; null when the version has nothing to show. */
  who: (TimetableFor & { name: string }) | null;
  bell: GridBell;
  slots: ViewSlot[];
  choices: Record<ViewKind, ViewChoice[]>;
}

const byName = (a: ViewChoice, b: ViewChoice) =>
  a.name.localeCompare(b.name, undefined, { numeric: true });

/** Everything a version's snapshot lets you pick, by kind, sorted by name. */
export function viewChoices(snapshot: SetupSnapshotV1): Record<ViewKind, ViewChoice[]> {
  const names = targetNames(snapshot);
  return {
    section: snapshot.sections.map((s) => ({ id: s.id, name: s.displayName })).sort(byName),
    subgroup: snapshot.subGroups
      .map((g) => ({ id: g.id, name: names.get(g.id) ?? g.name }))
      .sort(byName),
    faculty: snapshot.faculty
      .map((f) => ({ id: f.id, name: `${f.name} (${f.shortCode})` }))
      .sort(byName),
    room: snapshot.rooms.map((r) => ({ id: r.id, name: r.code })).sort(byName),
  };
}

/**
 * The bell schedule to draw `who`'s week with: their cohort's for a section or sub-group, the
 * default schedule for a teacher or room (who may follow several).
 */
export function viewBell(snapshot: SetupSnapshotV1, who: TimetableFor | null): GridBell | null {
  let sectionId: string | undefined;
  if (who?.kind === 'section') sectionId = who.id;
  if (who?.kind === 'subgroup')
    sectionId = snapshot.subGroups.find((g) => g.id === who.id)?.sectionId;
  const cohortId = snapshot.sections.find((s) => s.id === sectionId)?.cohortId;
  const cohort = snapshot.cohorts.find((c) => c.id === cohortId);
  const bell = cohort
    ? bellScheduleFor(cohort, snapshot.bellSchedules)
    : (snapshot.bellSchedules.find((b) => b.isDefault) ?? snapshot.bellSchedules[0] ?? null);
  if (!bell) return null;
  return {
    workingDays: [...bell.workingDays],
    periods: bell.periods.map((p) => ({ ...p })),
    breaks: bell.breaks.map((b) => ({ ...b })),
  };
}

/** One week: `who`'s classes of a version, in order, with the bell schedule to draw them. */
export function weekOf(
  snapshot: SetupSnapshotV1,
  slots: readonly StoredSlot[],
  who: TimetableFor,
): { bell: GridBell; slots: ViewSlot[] } {
  const subGroupSection =
    who.kind === 'subgroup' ? (subGroupSections(snapshot).get(who.id) ?? null) : null;
  return {
    bell: viewBell(snapshot, who) ?? { workingDays: [], periods: [], breaks: [] },
    slots: slots
      .filter((s) => slotIsFor(s, who, subGroupSection))
      .sort(compareSlots)
      .map((s) => ({ ...toSlotV1(s), locked: s.locked })),
  };
}
