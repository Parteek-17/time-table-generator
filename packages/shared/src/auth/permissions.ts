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
];

const ALL: readonly Action[] = ACTIONS;
const READ_ONLY: readonly Action[] = ['institute.view', 'department.view', 'timetable.view'];

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
  ],
  timetable_coordinator: [...READ_ONLY, 'timetable.edit', 'timetable.publish'],
  exam_coordinator: READ_ONLY,
  faculty: READ_ONLY,
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
