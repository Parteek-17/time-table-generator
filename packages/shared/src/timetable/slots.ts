/**
 * Timetable slots as P2T stores them: one placed session with the names it shows copied from
 * the setup snapshot, so a published version never changes when master data is edited later
 * (docs/adr/0050-timetable-versions-and-slots.md).
 */
import type { PlacedSessionV1 } from '../contracts/solver-timetable.v1';
import type { SetupSnapshotV1 } from '../contracts/setup-snapshot.v1';
import { bellScheduleFor } from '../domain/readiness';

export type SlotComponent = 'lecture' | 'tutorial' | 'practical';
export type SlotTargetKind = 'section' | 'subgroup' | 'elective_section';

export interface SlotFaculty {
  id: string;
  name: string;
  shortCode: string;
}

/** A slot's stored fields (the timetable_slots row without ids and timestamps). */
export interface SlotRecord {
  /** `<assignmentId>#<n>`. */
  sessionId: string;
  assignmentId: string;
  component: SlotComponent;
  courseId: string;
  courseCode: string;
  courseShortName: string;
  courseTitle: string;
  targetKind: SlotTargetKind;
  targetId: string;
  targetName: string;
  /** Regular sections whose students attend. */
  sectionIds: string[];
  facultyIds: string[];
  faculty: SlotFaculty[];
  roomId: string | null;
  roomCode: string | null;
  weekday: number;
  startPeriod: number;
  length: number;
  startMinute: number;
  endMinute: number;
  locked: boolean;
}

/** Display names of every audience in a snapshot: "CS A", "CS A-G1", "ML-1". */
export function targetNames(snapshot: SetupSnapshotV1): Map<string, string> {
  const sections = new Map(snapshot.sections.map((s) => [s.id, s]));
  const names = new Map<string, string>();
  for (const s of snapshot.sections) names.set(s.id, s.displayName);
  for (const g of snapshot.subGroups) {
    const section = sections.get(g.sectionId);
    names.set(g.id, section ? `${section.displayName}-${g.name}` : g.name);
  }
  for (const e of snapshot.electiveSections) names.set(e.id, e.name);
  return names;
}

/** The section a sub-group belongs to, by sub-group id. */
export function subGroupSections(snapshot: SetupSnapshotV1): Map<string, string> {
  return new Map(snapshot.subGroups.map((g) => [g.id, g.sectionId]));
}

/** Regular sections whose students attend a class for this audience. */
export function sectionIdsFor(
  target: { kind: SlotTargetKind; id: string },
  snapshot: SetupSnapshotV1,
): string[] {
  switch (target.kind) {
    case 'section':
      return [target.id];
    case 'subgroup': {
      const sectionId = snapshot.subGroups.find((g) => g.id === target.id)?.sectionId;
      return sectionId ? [sectionId] : [];
    }
    case 'elective_section':
      return snapshot.electiveSections.find((e) => e.id === target.id)?.sourceSectionIds ?? [];
  }
}

/** Something in a solver answer that the snapshot does not know. */
export class SnapshotMismatchError extends Error {
  constructor(what: string) {
    super(`The timetable refers to ${what}, which is not in the setup data it was built from.`);
    this.name = 'SnapshotMismatchError';
  }
}

/**
 * Turns solver placements into slot records, copying names and times from the snapshot.
 * Start and end minutes come from the bell schedule of the audience's cohort.
 */
export function slotsFromPlacements(
  snapshot: SetupSnapshotV1,
  placed: readonly PlacedSessionV1[],
): SlotRecord[] {
  const courses = new Map(snapshot.courses.map((c) => [c.id, c]));
  const faculty = new Map(snapshot.faculty.map((f) => [f.id, f]));
  const rooms = new Map(snapshot.rooms.map((r) => [r.id, r]));
  const cohorts = new Map(snapshot.cohorts.map((c) => [c.id, c]));
  const sectionCohort = new Map(snapshot.sections.map((s) => [s.id, s.cohortId]));
  const names = targetNames(snapshot);

  return placed.map((p) => {
    const course = courses.get(p.courseId);
    if (!course) throw new SnapshotMismatchError(`course ${p.courseId}`);
    const room = rooms.get(p.roomId);
    if (!room) throw new SnapshotMismatchError(`room ${p.roomId}`);
    const sectionIds = sectionIdsFor(p.target, snapshot);
    const cohort = cohorts.get(sectionCohort.get(sectionIds[0] ?? '') ?? '');
    if (!cohort) throw new SnapshotMismatchError(`audience ${p.target.id}`);
    const bell = bellScheduleFor(cohort, snapshot.bellSchedules);
    const first = bell?.periods.find((x) => x.index === p.startPeriodIndex);
    const last = bell?.periods.find((x) => x.index === p.startPeriodIndex + p.length - 1);
    if (!first || !last) {
      throw new SnapshotMismatchError(
        `periods ${p.startPeriodIndex}–${p.startPeriodIndex + p.length - 1} of ${cohort.displayCode}`,
      );
    }
    return {
      sessionId: p.sessionId,
      assignmentId: p.assignmentId,
      component: p.component,
      courseId: course.id,
      courseCode: course.code,
      courseShortName: course.shortName,
      courseTitle: course.title,
      targetKind: p.target.kind,
      targetId: p.target.id,
      targetName: names.get(p.target.id) ?? '',
      sectionIds,
      facultyIds: [...p.facultyIds],
      faculty: p.facultyIds.map((id) => {
        const f = faculty.get(id);
        if (!f) throw new SnapshotMismatchError(`faculty member ${id}`);
        return { id, name: f.name, shortCode: f.shortCode };
      }),
      roomId: room.id,
      roomCode: room.code,
      weekday: p.weekday,
      startPeriod: p.startPeriodIndex,
      length: p.length,
      startMinute: first.startMinute,
      endMinute: last.endMinute,
      locked: p.locked,
    };
  });
}
