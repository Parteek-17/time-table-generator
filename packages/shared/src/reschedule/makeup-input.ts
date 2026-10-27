/** Builds a make-up search for a cancelled class from the term's setup snapshot. Pure. */
import type { SetupSnapshotV1, TimetableSlotV1 } from '../contracts';
import { bellScheduleFor, roomFits } from '../domain';
import type { MakeUpRequest, MakeUpRoom } from './makeup';

export type MakeUpSetupProblem = 'no_bell_schedule' | 'no_room_need';

/** The request for `findMakeUps()`, or why the setup can't place this class at all. */
export function makeUpRequestFrom(
  snapshot: SetupSnapshotV1,
  slot: TimetableSlotV1,
  date: string,
  now: { today: string; nowMinute: number },
): MakeUpRequest | { problem: MakeUpSetupProblem } {
  const section = snapshot.sections.find((s) => slot.sectionIds.includes(s.id));
  const cohort = section && snapshot.cohorts.find((c) => c.id === section.cohortId);
  const bell = cohort ? bellScheduleFor(cohort, snapshot.bellSchedules) : null;
  if (!bell) return { problem: 'no_bell_schedule' };

  const course = snapshot.courses.find((c) => c.id === slot.course.id);
  const need = course?.roomNeeds[slot.component];
  if (!need) return { problem: 'no_room_need' };

  const strength = audienceStrength(snapshot, slot);
  const preferred = [slot.room?.id, section?.homeRoomId].filter((id): id is string => !!id);
  const rank = (id: string) => {
    const i = preferred.indexOf(id);
    return i === -1 ? preferred.length : i;
  };
  const rooms: MakeUpRoom[] = snapshot.rooms
    .filter((r) => roomFits(r, need) && r.capacity >= strength)
    .sort(
      (a, b) => rank(a.id) - rank(b.id) || a.capacity - b.capacity || a.code.localeCompare(b.code),
    )
    .map((r) => ({ id: r.id, code: r.code, capacity: r.capacity }));

  const teacherIds = slot.faculty.map((f) => f.id);
  const teachers = snapshot.faculty
    .filter((f) => teacherIds.includes(f.id))
    .map((f) => ({
      id: f.id,
      name: f.name,
      maxPeriodsPerDay: f.maxPeriodsPerDay,
      unavailable: f.unavailable,
    }));

  return {
    slot,
    date,
    bell: { workingDays: bell.workingDays, periods: bell.periods, breaks: bell.breaks },
    teachers,
    rooms,
    today: now.today,
    nowMinute: now.nowMinute,
  };
}

/** Students in the class: the section, lab group or elective section it is for. */
export function audienceStrength(
  snapshot: SetupSnapshotV1,
  slot: Pick<TimetableSlotV1, 'target' | 'sectionIds'>,
): number {
  switch (slot.target.kind) {
    case 'section':
      return snapshot.sections.find((s) => s.id === slot.target.id)?.strength ?? 0;
    case 'subgroup':
      return snapshot.subGroups.find((g) => g.id === slot.target.id)?.strength ?? 0;
    case 'elective_section':
      return snapshot.electiveSections.find((e) => e.id === slot.target.id)?.strength ?? 0;
  }
}
