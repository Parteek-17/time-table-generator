/**
 * The one clash checker for editing a timetable, used by the API (to refuse a bad edit) and
 * the web (to highlight valid cells while dragging and explain a refused drop). It checks a
 * class moved to a new start against CLAUDE.md's hard rules, using the snapshot the version
 * was built from. Problems come back as codes with names, for plain sentences in any language.
 */
import type { SetupSnapshotV1 } from '../contracts/setup-snapshot.v1';
import type { BusySlotV1 } from '../contracts/solver-timetable.v1';
import { roomFits } from '../domain/courses';
import { bellScheduleFor } from '../domain/readiness';
import { scopeApplies, type ScopedRow } from '../domain/scope';
import type { ViewSlot } from './view';

/** A slot as the editor holds it: the contract shape plus its session id. */
export type EditorSlot = ViewSlot & { sessionId: string };

/** Where a class should go: day, first period and (optionally) room. */
export interface MoveTarget {
  weekday: number;
  startPeriodIndex: number;
}

export const EDIT_PROBLEM_CODES = [
  'locked',
  'not_working_day',
  'outside_day',
  'crosses_break',
  'fixed_slot',
  'section_busy',
  'faculty_busy',
  'faculty_unavailable',
  'faculty_day_limit',
  'busy_elsewhere',
  'no_free_room',
] as const;
export type EditProblemCode = (typeof EDIT_PROBLEM_CODES)[number];

/** One reason a move is not allowed. `params` hold names for the sentence. */
export interface EditProblem {
  code: EditProblemCode;
  params: Record<string, string | number>;
}

export type MovePlan =
  | { ok: true; roomId: string | null; roomCode: string | null; roomChanged: boolean }
  | { ok: false; problems: EditProblem[] };

const periodsLabel = (start: number, length: number) =>
  length > 1 ? `P${start}–P${start + length - 1}` : `P${start}`;

const overlaps = (aStart: number, aLen: number, bStart: number, bLen: number) =>
  aStart < bStart + bLen && bStart < aStart + aLen;

export class TimetableChecker {
  private readonly bySlot = new Map<string, EditorSlot>();
  private readonly courseGroup: Map<string, string | null>;
  private readonly faculty: Map<string, SetupSnapshotV1['faculty'][number]>;
  private readonly strength = new Map<string, number>();

  constructor(
    private readonly snapshot: SetupSnapshotV1,
    private slots: EditorSlot[],
    private readonly busy: readonly BusySlotV1[] = [],
  ) {
    for (const s of slots) this.bySlot.set(s.id, s);
    this.courseGroup = new Map(snapshot.courses.map((c) => [c.id, c.electiveGroup]));
    this.faculty = new Map(snapshot.faculty.map((f) => [f.id, f]));
    for (const x of [...snapshot.sections, ...snapshot.subGroups, ...snapshot.electiveSections]) {
      this.strength.set(x.id, x.strength);
    }
  }

  /** Replace the slots (after an edit); the snapshot stays. */
  update(slots: EditorSlot[]): void {
    this.slots = slots;
    this.bySlot.clear();
    for (const s of slots) this.bySlot.set(s.id, s);
  }

  slot(slotId: string): EditorSlot | undefined {
    return this.bySlot.get(slotId);
  }

  private cohortOf(slot: EditorSlot) {
    const section = this.snapshot.sections.find((s) => s.id === slot.sectionIds[0]);
    return section ? this.snapshot.cohorts.find((c) => c.id === section.cohortId) : undefined;
  }

  private bellOf(slot: EditorSlot) {
    const cohort = this.cohortOf(slot);
    return cohort
      ? bellScheduleFor(cohort, this.snapshot.bellSchedules)
      : (this.snapshot.bellSchedules.find((b) => b.isDefault) ?? null);
  }

  /** Whether two classes' students would be in two places at once. */
  private audiencesClash(a: EditorSlot, b: EditorSlot): boolean {
    if (a.target.id === b.target.id) return true;
    // Two lab groups meet separately, even in the same section.
    if (a.target.kind === 'subgroup' && b.target.kind === 'subgroup') return false;
    // Electives of one group (e.g. "Elective-IV") run side by side on purpose.
    if (a.target.kind === 'elective_section' && b.target.kind === 'elective_section') {
      const group = this.courseGroup.get(a.course.id);
      if (group && group === this.courseGroup.get(b.course.id)) return false;
    }
    return a.sectionIds.some((id) => b.sectionIds.includes(id));
  }

  /** Every rule except the room, which plan() tries to solve. */
  private timeProblems(slot: EditorSlot, to: MoveTarget): EditProblem[] {
    const problems: EditProblem[] = [];
    const { weekday, startPeriodIndex: start } = to;
    const len = slot.length;
    const periods = periodsLabel(start, len);
    const bell = this.bellOf(slot);
    if (!bell || !bell.workingDays.includes(weekday)) {
      return [{ code: 'not_working_day', params: { weekday } }];
    }
    for (let p = start; p < start + len; p++) {
      if (!bell.periods.some((x) => x.index === p)) {
        return [{ code: 'outside_day', params: { weekday, periods } }];
      }
    }
    const longBreak = bell.breaks.find(
      (b) => b.minutes >= 30 && b.afterPeriodIndex >= start && b.afterPeriodIndex < start + len - 1,
    );
    if (longBreak) problems.push({ code: 'crosses_break', params: { break: longBreak.label } });

    const cohort = this.cohortOf(slot);
    for (const f of this.snapshot.fixedSlots) {
      if (f.weekday !== weekday) continue;
      if (!overlaps(start, len, f.startPeriodIndex, f.endPeriodIndex - f.startPeriodIndex + 1)) {
        continue;
      }
      const forStudents =
        cohort &&
        slot.sectionIds.some((sectionId) =>
          scopeApplies(f as ScopedRow, {
            departmentId: cohort.departmentId,
            programmeId: cohort.programmeId,
            cohortId: cohort.id,
            sectionId,
          }),
        );
      const forTeacher = f.facultyIds.some((id) => slot.faculty.some((x) => x.id === id));
      if (forStudents || forTeacher)
        problems.push({ code: 'fixed_slot', params: { label: f.label } });
    }

    const sameDay = this.slots.filter((s) => s.id !== slot.id && s.weekday === weekday);
    for (const other of sameDay) {
      if (!overlaps(start, len, other.startPeriodIndex, other.length)) continue;
      if (this.audiencesClash(slot, other)) {
        problems.push({
          code: 'section_busy',
          params: { who: other.target.name, code: other.course.code, periods },
        });
      }
      for (const f of other.faculty) {
        if (slot.faculty.some((x) => x.id === f.id)) {
          problems.push({
            code: 'faculty_busy',
            params: { name: f.name, who: other.target.name, code: other.course.code, periods },
          });
        }
      }
    }

    for (const t of slot.faculty) {
      const f = this.faculty.get(t.id);
      if (!f) continue;
      if (
        f.unavailable.some(
          (c) => c.weekday === weekday && c.periodIndex >= start && c.periodIndex < start + len,
        )
      ) {
        problems.push({ code: 'faculty_unavailable', params: { name: f.name, weekday, periods } });
      }
      if (f.maxPeriodsPerDay > 0) {
        const taught = sameDay
          .filter((s) => s.faculty.some((x) => x.id === f.id))
          .reduce((sum, s) => sum + s.length, 0);
        if (taught + len > f.maxPeriodsPerDay) {
          problems.push({
            code: 'faculty_day_limit',
            params: { name: f.name, max: f.maxPeriodsPerDay, weekday },
          });
        }
      }
    }

    // A lookup, not `resource === 'faculty'`: the lint rule against inline role checks flags it.
    // Rooms are left to plan(), which looks for another free one.
    const ownIds: Partial<Record<BusySlotV1['resource'], string[]>> = {
      faculty: slot.faculty.map((x) => x.id),
      section: slot.sectionIds,
    };
    for (const b of this.busy) {
      if (b.weekday !== weekday || b.periodIndex < start || b.periodIndex >= start + len) continue;
      if (ownIds[b.resource]?.includes(b.id)) {
        problems.push({ code: 'busy_elsewhere', params: { reason: b.reason ?? '' } });
      }
    }
    return dedupe(problems);
  }

  /**
   * Rooms that suit the class (type, lab category, size): the preferred room first (undo puts a
   * class back in its old room), then its own, then the smallest.
   */
  private suitableRooms(slot: EditorSlot, preferRoomId?: string | null) {
    const course = this.snapshot.courses.find((c) => c.id === slot.course.id);
    const need = course?.roomNeeds[slot.component];
    const size = this.strength.get(slot.target.id) ?? 0;
    const rank = (id: string) => (id === preferRoomId ? 2 : id === slot.room?.id ? 1 : 0);
    return this.snapshot.rooms
      .filter((r) => (need ? roomFits(r, need) : true) && r.capacity >= size)
      .sort((a, b) => rank(b.id) - rank(a.id) || a.capacity - b.capacity);
  }

  private roomFree(roomId: string, slot: EditorSlot, to: MoveTarget): boolean {
    const takenBySlot = this.slots.some(
      (s) =>
        s.id !== slot.id &&
        s.room?.id === roomId &&
        s.weekday === to.weekday &&
        overlaps(to.startPeriodIndex, slot.length, s.startPeriodIndex, s.length),
    );
    const takenElsewhere = this.busy.some(
      (b) =>
        b.resource === 'room' &&
        b.id === roomId &&
        b.weekday === to.weekday &&
        b.periodIndex >= to.startPeriodIndex &&
        b.periodIndex < to.startPeriodIndex + slot.length,
    );
    return !takenBySlot && !takenElsewhere;
  }

  /**
   * Whether the class can move there, and in which room: its own room if free, else the
   * smallest suitable free room (or `preferRoomId` when it is free and suits). Locked classes
   * never move.
   */
  plan(slotId: string, to: MoveTarget, preferRoomId?: string | null): MovePlan {
    const slot = this.bySlot.get(slotId);
    if (!slot) return { ok: false, problems: [{ code: 'outside_day', params: {} }] };
    if (slot.locked)
      return { ok: false, problems: [{ code: 'locked', params: { code: slot.course.code } }] };
    const problems = this.timeProblems(slot, to);
    if (problems.length) return { ok: false, problems };
    const room = this.suitableRooms(slot, preferRoomId).find((r) => this.roomFree(r.id, slot, to));
    if (!room) {
      return {
        ok: false,
        problems: [
          {
            code: 'no_free_room',
            params: {
              periods: periodsLabel(to.startPeriodIndex, slot.length),
              weekday: to.weekday,
            },
          },
        ],
      };
    }
    return {
      ok: true,
      roomId: room.id,
      roomCode: room.code,
      roomChanged: room.id !== slot.room?.id,
    };
  }

  /** Start and end minutes of the class if it started at this period (null if it doesn't fit). */
  times(
    slotId: string,
    startPeriodIndex: number,
  ): { startMinute: number; endMinute: number } | null {
    const slot = this.bySlot.get(slotId);
    const bell = slot && this.bellOf(slot);
    const first = bell?.periods.find((p) => p.index === startPeriodIndex);
    const last = bell?.periods.find((p) => p.index === startPeriodIndex + (slot?.length ?? 1) - 1);
    return first && last ? { startMinute: first.startMinute, endMinute: last.endMinute } : null;
  }

  /** The department whose classes these are (the cohort's), for permission checks. */
  departmentOf(slotId: string): string | null {
    const slot = this.bySlot.get(slotId);
    return (slot && this.cohortOf(slot)?.departmentId) ?? null;
  }

  /** Every start where the class could go (for highlighting while dragging). */
  validStarts(slotId: string): MoveTarget[] {
    const slot = this.bySlot.get(slotId);
    const bell = slot && this.bellOf(slot);
    if (!slot || !bell || slot.locked) return [];
    const out: MoveTarget[] = [];
    for (const weekday of bell.workingDays) {
      for (const p of bell.periods) {
        const to = { weekday, startPeriodIndex: p.index };
        if (this.plan(slotId, to).ok) out.push(to);
      }
    }
    return out;
  }
}

function dedupe(problems: EditProblem[]): EditProblem[] {
  const seen = new Set<string>();
  return problems.filter((p) => {
    const key = `${p.code}:${JSON.stringify(p.params)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** English sentence for an API error message. The web uses its messages file instead. */
export function problemText(p: EditProblem): string {
  const v = p.params;
  const day = DAYS[Number(v.weekday)] ?? '';
  switch (p.code) {
    case 'locked':
      return `${v.code} is locked. Unlock it to move it.`;
    case 'not_working_day':
      return `${day} is not a teaching day.`;
    case 'outside_day':
      return `It does not fit before the end of ${day}.`;
    case 'crosses_break':
      return `A lab cannot run across ${v.break}.`;
    case 'fixed_slot':
      return `This time is kept free for ${v.label}.`;
    case 'section_busy':
      return `${v.who} already has ${v.code} in ${v.periods}.`;
    case 'faculty_busy':
      return `${v.name} teaches ${v.who} (${v.code}) in ${v.periods}.`;
    case 'faculty_unavailable':
      return `${v.name} is not available on ${day} ${v.periods}.`;
    case 'faculty_day_limit':
      return `${v.name} would teach more than ${v.max} periods on ${day}.`;
    case 'busy_elsewhere':
      return `Already booked in another timetable${v.reason ? `: ${v.reason}` : ''}.`;
    case 'no_free_room':
      return `No suitable room is free on ${day} ${v.periods}.`;
  }
}
