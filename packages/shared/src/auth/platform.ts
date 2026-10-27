import { can, type AuthUser, type Resource } from './can';

/**
 * An institute id no real institute has. Managing "an institute that is nobody's" is what
 * only platform-scope memberships may do: every other scope is tied to a real institute,
 * university or department id, so can() refuses them here.
 */
export const NO_INSTITUTE_ID = '00000000-0000-0000-0000-000000000000';

/** The resource for platform screens (all institutes, plans, sign-ups). */
export const PLATFORM_RESOURCE: Resource = { type: 'institute', instituteId: NO_INSTITUTE_ID };

/** Platform admin check, through can() like every other permission check. */
export function canManagePlatform(user: AuthUser): boolean {
  return can(user, 'institute.manage', PLATFORM_RESOURCE);
}
