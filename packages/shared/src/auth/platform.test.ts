import { describe, expect, it } from 'vitest';
import type { AuthUser } from './can';
import { canManagePlatform } from './platform';

const platformAdmin: AuthUser = {
  id: 'p',
  memberships: [
    { role: 'platform_admin', scopeType: 'platform', scopeId: null, instituteId: null },
  ],
};
const instituteAdmin: AuthUser = {
  id: 'a',
  memberships: [
    { role: 'institute_admin', scopeType: 'institute', scopeId: 'inst-a', instituteId: 'inst-a' },
  ],
};
const universityAdmin: AuthUser = {
  id: 'u',
  memberships: [
    { role: 'university_admin', scopeType: 'university', scopeId: 'univ', instituteId: 'univ' },
  ],
};

describe('canManagePlatform', () => {
  it('only platform admins', () => {
    expect(canManagePlatform(platformAdmin)).toBe(true);
    expect(canManagePlatform(instituteAdmin)).toBe(false);
    expect(canManagePlatform(universityAdmin)).toBe(false);
    expect(canManagePlatform({ id: 'x', memberships: [] })).toBe(false);
  });

  it('a platform role held in an institute scope does not count', () => {
    const odd: AuthUser = {
      id: 'o',
      memberships: [
        {
          role: 'platform_admin',
          scopeType: 'institute',
          scopeId: 'inst-a',
          instituteId: 'inst-a',
        },
      ],
    };
    expect(canManagePlatform(odd)).toBe(false);
  });
});
