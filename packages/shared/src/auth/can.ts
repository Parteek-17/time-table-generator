import {
  ASSIGNABLE_ROLES,
  INSTITUTE_WIDE_READS,
  ROLE_PERMISSIONS,
  type Action,
} from './permissions';
import { ROLES, type Role, type ScopeType } from './roles';

/** One scoped role held by a user: (user, role, scope_type, scope_id). */
export interface MembershipGrant {
  role: Role;
  scopeType: ScopeType;
  /** Institute id (university/institute scope), department id, section id; null for platform. */
  scopeId: string | null;
  /** Institute the membership lives in; null only for platform scope. */
  instituteId: string | null;
}

export interface AuthUser {
  id: string;
  memberships: readonly MembershipGrant[];
}

export type ResourceType =
  'institute' | 'department' | 'membership' | 'invite' | 'audit_log' | 'timetable';

/** What the action is performed on. Always located inside one institute. */
export interface Resource {
  type: ResourceType;
  instituteId: string;
  /** The institute's parent university, if it is an affiliated college. */
  universityId?: string | null;
  departmentId?: string | null;
  sectionId?: string | null;
  /** For member.invite / member.revoke: the role being granted or removed. */
  role?: Role;
}

const ROLE_ASSIGNMENT_ACTIONS: readonly Action[] = ['member.invite', 'member.revoke'];

function scopeCovers(grant: MembershipGrant, action: Action, resource: Resource): boolean {
  switch (grant.scopeType) {
    case 'platform':
      return true;
    case 'university':
      return resource.instituteId === grant.scopeId || resource.universityId === grant.scopeId;
    case 'institute':
      return resource.instituteId === grant.scopeId;
    case 'department':
      if (resource.instituteId !== grant.instituteId) return false;
      if (INSTITUTE_WIDE_READS.includes(action)) return true;
      return resource.departmentId != null && resource.departmentId === grant.scopeId;
    case 'section':
      if (resource.instituteId !== grant.instituteId) return false;
      if (INSTITUTE_WIDE_READS.includes(action)) return true;
      return resource.sectionId != null && resource.sectionId === grant.scopeId;
  }
}

function grantAllows(grant: MembershipGrant, action: Action, resource: Resource): boolean {
  if (!ROLE_PERMISSIONS[grant.role].includes(action)) return false;
  if (!scopeCovers(grant, action, resource)) return false;
  if (ROLE_ASSIGNMENT_ACTIONS.includes(action)) {
    if (!resource.role) return false;
    return ASSIGNABLE_ROLES[grant.role].includes(resource.role);
  }
  return true;
}

/**
 * The single authorization check. Pure: no I/O, no globals.
 * Returns true if any of the user's memberships allows the action on the resource.
 */
export function can(user: AuthUser, action: Action, resource: Resource): boolean {
  return user.memberships.some((grant) => grantAllows(grant, action, resource));
}

/** True if the user has any membership that reaches into this institute. */
export function belongsToInstitute(
  user: AuthUser,
  institute: { id: string; parentUniversityId?: string | null },
): boolean {
  return can(user, 'institute.view', {
    type: 'institute',
    instituteId: institute.id,
    universityId: institute.parentUniversityId ?? null,
  });
}

/**
 * True if the user may perform the action on at least one thing in this institute
 * (the institute itself, or one of their own departments/sections). For role-granting
 * actions, any grantable role counts. Used to decide whether to show a page or route
 * at all; the exact resource is still checked with can() before acting.
 */
export function canSomewhere(
  user: AuthUser,
  action: Action,
  institute: { id: string; parentUniversityId?: string | null },
): boolean {
  const base: Resource = {
    type: 'institute',
    instituteId: institute.id,
    universityId: institute.parentUniversityId ?? null,
  };
  const candidates: Resource[] = [base];
  for (const grant of user.memberships) {
    if (grant.instituteId !== institute.id || !grant.scopeId) continue;
    if (grant.scopeType === 'department') candidates.push({ ...base, departmentId: grant.scopeId });
    if (grant.scopeType === 'section') candidates.push({ ...base, sectionId: grant.scopeId });
  }
  const roles: readonly (Role | undefined)[] = ROLE_ASSIGNMENT_ACTIONS.includes(action)
    ? ROLES
    : [undefined];
  return candidates.some((resource) =>
    roles.some((role) => can(user, action, role ? { ...resource, role } : resource)),
  );
}

/** Roles this user may grant at the given place (for the invite form). */
export function assignableRoles(user: AuthUser, resource: Omit<Resource, 'role'>): Role[] {
  return ROLES.filter((role) => can(user, 'member.invite', { ...resource, role }));
}
