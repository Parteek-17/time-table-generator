import type { AuthUser } from '@slotwise/shared';
import type { Institute } from '@slotwise/db';
import type { Request } from 'express';

export interface SignedInUser {
  id: string;
  email: string;
  name: string | null;
}

/** Set by TenantGuard: the institute from the subdomain and the caller's memberships. */
export interface Tenant {
  institute: Institute;
  /** Shape that can() takes. Includes memberships elsewhere that reach this institute. */
  authUser: AuthUser;
  user: SignedInUser;
}

export interface AppRequest extends Request {
  user?: SignedInUser;
  /** Set by TenantGuard on every institute route, including public ones. */
  institute?: Institute;
  /** Set by TenantGuard when the caller is signed in. */
  tenant?: Tenant;
}
