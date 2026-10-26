import 'server-only';
import { API_JWT_AUDIENCE, API_JWT_ISSUER, INSTITUTE_SLUG_HEADER } from '@slotwise/shared';
import { SignJWT } from 'jose';
import { auth } from '@/auth';
import { getInstituteSlug, type ApiResult } from '@/lib/api';
import { env } from '@/lib/env';

/**
 * Sends an uploaded file to POST /imports as the raw request body (the API's JSON body limit
 * is too small for spreadsheets). Mints the same short-lived token as `api()` in
 * lib/api.ts, which only sends JSON; requests/2026-10-27-p1-api-raw-upload.md asks INT for
 * a shared helper so this copy can go.
 */
export async function uploadToApi<T>(path: string, file: Blob): Promise<ApiResult<T>> {
  const [session, slug] = await Promise.all([auth(), getInstituteSlug()]);
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/octet-stream',
  };
  if (slug) headers[INSTITUTE_SLUG_HEADER] = slug;
  if (session?.user?.id) {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(session.user.id)
      .setIssuer(API_JWT_ISSUER)
      .setAudience(API_JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(env().API_JWT_SECRET));
    headers.authorization = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(`${env().API_URL}${path}`, {
      method: 'POST',
      headers,
      body: Buffer.from(await file.arrayBuffer()),
      cache: 'no-store',
    });
  } catch {
    return {
      ok: false,
      status: 503,
      message: 'Slotwise can’t be reached right now. Please try again in a minute.',
    };
  }
  const body: unknown = await res.json().catch(() => null);
  if (res.ok) return { ok: true, status: res.status, data: body as T };
  const err = (body ?? {}) as { message?: unknown };
  return {
    ok: false,
    status: res.status,
    message:
      typeof err.message === 'string' ? err.message : 'Something went wrong. Please try again.',
  };
}
