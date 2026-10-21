import type { MembershipDto } from '@slotwise/shared';

type T = (key: string, values?: Record<string, string>) => string;

/**
 * "Institute admin at Demo Institute" or "Head of department (CSE) at Demo Institute".
 * tHome is the "home" namespace translator and tRoles the "roles" one.
 */
export function describeMembership(
  m: Pick<MembershipDto, 'role' | 'scope'>,
  instituteName: string,
  tHome: T,
  tRoles: T,
): string {
  const role = tRoles(m.role);
  if (m.scope.type === 'department' || m.scope.type === 'section') {
    return tHome('roleAtScope', { role, scope: m.scope.name, institute: instituteName });
  }
  return tHome('roleAt', { role, institute: instituteName });
}
