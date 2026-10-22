import type { Role } from './roles';

export const ACTIONS = [
  'institute.view',
  'institute.manage',
  'department.view',
  'department.manage',
  'member.view',
  'member.invite',
  'member.revoke',
  'audit.view',
  'timetable.view',
  'timetable.edit',
  'timetable.publish',
  // Phase 1: institute master data (docs/adr/0008-master-data-permissions.md)
  /** Read any master data: departments, programmes, schemes, cohorts, faculty, rooms, calendar. */
  'masterdata.view',
  /** Sessions, terms, cohort start windows, promoting batches. */
  'term.manage',
  /** Holidays, calendar windows, extra working days, bell schedules. */
  'calendar.manage',
  /** Buildings and rooms. */
  'infrastructure.manage',
  /** Programmes, branches, scheme versions, courses. */
  'academics.manage',
  /** Batches, cohorts, sections, sub-groups, elective sections, students. */
  'cohort.manage',
  'faculty.manage',
  /** Faculty members may do this for their own record only (SELF_ONLY_ACTIONS). */
  'faculty.availability.edit',
  /** Teaching assignments (subject distribution) and subject mentors. */
  'teaching.manage',
  'fixed_slot.manage',
  'timetable_scope.manage',
  /** Start an Excel/CSV import. Each row is checked again with the action for its kind. */
  'import.run',
  'readiness.view',
] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * Reads that anyone with a membership in an institute may do anywhere in it,
 * whatever the scope of their membership (e.g. a student reads published timetables).
 */
export const INSTITUTE_WIDE_READS: readonly Action[] = [
  'institute.view',
  'department.view',
  'timetable.view',
  'masterdata.view',
  'readiness.view',
];

/**
 * Actions that some roles may only perform on their own record: the resource's ownerUserId
 * must be the user. Other roles holding the action use their scope as usual.
 */
export const SELF_ONLY_ACTIONS: Readonly<Partial<Record<Role, readonly Action[]>>> = {
  faculty: ['faculty.availability.edit'],
};

const ALL: readonly Action[] = ACTIONS;
/** What every staff member may read. Students never read master data. */
const READ_ONLY: readonly Action[] = [
  'institute.view',
  'department.view',
  'timetable.view',
  'masterdata.view',
];

/** Role → actions. Where an action applies is decided by the membership's scope. */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Action[]>> = {
  platform_admin: ALL,
  university_admin: ALL,
  institute_admin: ALL,
  hod: [
    ...READ_ONLY,
    'department.manage',
    'member.view',
    'member.invite',
    'member.revoke',
    'audit.view',
    'timetable.edit',
    'timetable.publish',
    'academics.manage',
    'cohort.manage',
    'faculty.manage',
    'faculty.availability.edit',
    'teaching.manage',
    'import.run',
    'readiness.view',
  ],
  timetable_coordinator: [
    ...READ_ONLY,
    'timetable.edit',
    'timetable.publish',
    'teaching.manage',
    'fixed_slot.manage',
    'timetable_scope.manage',
    'import.run',
    'readiness.view',
  ],
  exam_coordinator: READ_ONLY,
  faculty: [...READ_ONLY, 'faculty.availability.edit'],
  student: ['institute.view', 'timetable.view'],
};

/** Roles each role may hand out (invite) or take away (revoke). */
export const ASSIGNABLE_ROLES: Readonly<Record<Role, readonly Role[]>> = {
  platform_admin: [
    'platform_admin',
    'university_admin',
    'institute_admin',
    'hod',
    'timetable_coordinator',
    'exam_coordinator',
    'faculty',
    'student',
  ],
  university_admin: [
    'institute_admin',
    'hod',
    'timetable_coordinator',
    'exam_coordinator',
    'faculty',
    'student',
  ],
  institute_admin: [
    'institute_admin',
    'hod',
    'timetable_coordinator',
    'exam_coordinator',
    'faculty',
    'student',
  ],
  hod: ['timetable_coordinator', 'faculty', 'student'],
  timetable_coordinator: [],
  exam_coordinator: [],
  faculty: [],
  student: [],
};
