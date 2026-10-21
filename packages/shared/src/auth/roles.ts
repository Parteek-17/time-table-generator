/**
 * Roles and scopes, exactly as listed in CLAUDE.md ("Roles (RBAC)").
 * The Prisma enums in packages/db mirror these values; keep them in sync.
 */
export const ROLES = [
  'platform_admin',
  'university_admin',
  'institute_admin',
  'hod',
  'timetable_coordinator',
  'exam_coordinator',
  'faculty',
  'student',
] as const;
export type Role = (typeof ROLES)[number];

export const SCOPE_TYPES = [
  'platform',
  'university',
  'institute',
  'department',
  'section',
] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

/** Which scope types each role may be granted at. */
export const ROLE_SCOPES: Readonly<Record<Role, readonly ScopeType[]>> = {
  platform_admin: ['platform'],
  university_admin: ['university'],
  institute_admin: ['institute'],
  hod: ['department'],
  timetable_coordinator: ['department', 'institute'],
  exam_coordinator: ['institute'],
  // CLAUDE.md scopes faculty and students to "self"; their membership still sits at
  // institute or department level so we know where they belong.
  faculty: ['department', 'institute'],
  student: ['institute', 'section'],
};

/** Roles an institute-level invite form may offer (section scope arrives with sections). */
export const INVITABLE_SCOPE_TYPES = ['institute', 'department'] as const;
export type InvitableScopeType = (typeof INVITABLE_SCOPE_TYPES)[number];

export function isScopeAllowedForRole(role: Role, scopeType: ScopeType): boolean {
  return ROLE_SCOPES[role].includes(scopeType);
}
