import 'server-only';
import { API_JWT_AUDIENCE, API_JWT_ISSUER, INSTITUTE_SLUG_HEADER } from '@slotwise/shared';
import { SignJWT } from 'jose';
import { headers } from 'next/headers';
import { auth } from '@/auth';
import { env } from './env';

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; message: string; fieldErrors?: Record<string, string[]> };

/** The institute slug the proxy resolved from the subdomain, or null on the bare domain. */
export async function getInstituteSlug(): Promise<string | null> {
  return (await headers()).get(INSTITUTE_SLUG_HEADER);
}

/** Short-lived token the API verifies (docs/adr/0001-auth.md). */
function mintApiToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(API_JWT_ISSUER)
    .setAudience(API_JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(env().API_JWT_SECRET));
}

/** Calls the API as the signed-in user, for the institute on this subdomain. Server-side only. */
export async function api<T>(
  path: string,
  init: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const [session, slug] = await Promise.all([auth(), getInstituteSlug()]);
  const requestHeaders: Record<string, string> = { accept: 'application/json' };
  if (slug) requestHeaders[INSTITUTE_SLUG_HEADER] = slug;
  if (session?.user?.id) {
    requestHeaders.authorization = `Bearer ${await mintApiToken(session.user.id)}`;
  }
  if (init.body !== undefined) requestHeaders['content-type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${env().API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: requestHeaders,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    });
  } catch {
    return {
      ok: false,
      status: 503,
      message: 'Slotwise can’t be reached right now. Please try again in a minute.',
    };
  }

  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.ok) return { ok: true, status: res.status, data: body as T };
  const err = (body ?? {}) as { message?: unknown; fieldErrors?: Record<string, string[]> };
  return {
    ok: false,
    status: res.status,
    message:
      typeof err.message === 'string' ? err.message : 'Something went wrong. Please try again.',
    fieldErrors: err.fieldErrors,
  };
}
