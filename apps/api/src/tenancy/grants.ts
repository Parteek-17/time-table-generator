import type { Membership } from '@slotwise/db';
import type { MembershipGrant } from '@slotwise/shared';

export function toGrant(m: Membership): MembershipGrant {
  return {
    role: m.role,
    scopeType: m.scopeType,
    scopeId: m.scopeId,
    instituteId: m.instituteId,
  };
}
