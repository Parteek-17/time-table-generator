import 'server-only';
import {
  can,
  canSomewhere,
  type Action,
  type AuthUser,
  type MeResponse,
  type Resource,
} from '@slotwise/shared';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { auth } from '@/auth';
import { api } from './api';

export interface Me extends MeResponse {
  authUser: AuthUser;
  /** canSomewhere() for this institute: may the user do this anywhere here? */
  may(action: Action): boolean;
  /** can() for an exact resource of this institute. */
  mayOn(action: Action, resource: Omit<Resource, 'instituteId' | 'universityId'>): boolean;
}

/**
 * The signed-in user in this institute, loaded once per request. Redirects to sign-in
 * (keeping the page to come back to) or home when they have no access here.
 */
export const getMe = cache(async (returnTo = '/'): Promise<Me> => {
  const session = await auth();
  if (!session?.user) redirect(`/sign-in?callbackUrl=${encodeURIComponent(returnTo)}`);
  const res = await api<MeResponse>('/me');
  if (!res.ok) redirect('/');
  const authUser: AuthUser = { id: res.data.user.id, memberships: res.data.grants };
  const place = {
    id: res.data.institute.id,
    parentUniversityId: res.data.institute.parentUniversityId,
  };
  return {
    ...res.data,
    authUser,
    may: (action) => canSomewhere(authUser, action, place),
    mayOn: (action, resource) =>
      can(authUser, action, {
        ...resource,
        instituteId: place.id,
        universityId: place.parentUniversityId,
      } as Resource),
  };
});

/** Unwraps an API list, or [] when it fails (the page shows its own problem). */
export async function list<T>(path: string): Promise<T[]> {
  const res = await api<T[]>(path);
  return res.ok ? res.data : [];
}
