import { ELECTIVE_COURSE_TYPES, type Component, type CourseType, type RoomType } from './constants';

export type GroupedBy = 'section' | 'subgroup';

export interface CourseLtp {
  lectures: number;
  tutorials: number;
  practicals: number;
}

/** Credits = L + T + P/2 unless the scheme overrides it. */
export function credits(course: CourseLtp & { creditsOverride?: number | null }): number {
  if (course.creditsOverride != null) return course.creditsOverride;
  return course.lectures + course.tutorials + course.practicals / 2;
}

/** "3-1-2" */
export function formatLtp(course: CourseLtp): string {
  return `${course.lectures}-${course.tutorials}-${course.practicals}`;
}

/** Periods per week of one component (the L, T or P of the course). */
export function componentPeriods(course: CourseLtp, component: Component): number {
  switch (component) {
    case 'lecture':
      return course.lectures;
    case 'tutorial':
      return course.tutorials;
    case 'practical':
      return course.practicals;
  }
}

export interface SchedulableCourse extends CourseLtp {
  type: CourseType;
  isScheduled: boolean;
  tutorialBy: GroupedBy;
  practicalBy: GroupedBy;
}

/** Periods a course takes in a section's week (0 for MOOCs, training, project-only). */
export function weeklyPeriods(course: SchedulableCourse): number {
  if (!course.isScheduled) return 0;
  return course.lectures + course.tutorials + course.practicals;
}

/** Components with at least one period a week. */
export function activeComponents(course: SchedulableCourse): Component[] {
  if (!course.isScheduled) return [];
  return (['lecture', 'tutorial', 'practical'] as const).filter(
    (c) => componentPeriods(course, c) > 0,
  );
}

/** Lectures are for the whole section; tutorials and practicals follow the course setting. */
export function groupingFor(course: SchedulableCourse, component: Component): GroupedBy {
  if (component === 'lecture') return 'section';
  return component === 'tutorial' ? course.tutorialBy : course.practicalBy;
}

export function isElective(course: { type: CourseType }): boolean {
  return ELECTIVE_COURSE_TYPES.includes(course.type);
}

export interface RoomNeed {
  type: RoomType;
  /** Lab category the room must offer, if any. */
  labCategory: string | null;
}

/**
 * Room a component needs. Lectures and tutorials use lecture rooms (tutorial rooms also
 * fit tutorials); practicals use the course's room type, a lab by default.
 */
export function roomNeedFor(
  course: { roomType: RoomType | null; labCategory: string | null },
  component: Component,
): RoomNeed {
  if (component === 'lecture') return { type: 'lecture', labCategory: null };
  if (component === 'tutorial') return { type: 'tutorial', labCategory: null };
  const type = course.roomType ?? 'lab';
  return { type, labCategory: type === 'lab' ? course.labCategory : null };
}

/** Whether a room of this type and these lab categories can host the need. */
export function roomFits(
  room: { type: RoomType; labCategories: readonly string[] },
  need: RoomNeed,
): boolean {
  if (need.type === 'tutorial') return room.type === 'tutorial' || room.type === 'lecture';
  if (room.type !== need.type) return false;
  if (need.labCategory == null) return true;
  const wanted = need.labCategory.trim().toLowerCase();
  return room.labCategories.some((c) => c.trim().toLowerCase() === wanted);
}

/** Class capacity: the override, else rows × seats per row. */
export function classCapacity(room: {
  rows: number | null;
  seatsPerRow: number | null;
  capacityOverride: number | null;
}): number {
  if (room.capacityOverride != null) return room.capacityOverride;
  return (room.rows ?? 0) * (room.seatsPerRow ?? 0);
}
