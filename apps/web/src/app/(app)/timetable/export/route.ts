import {
  API_JWT_AUDIENCE,
  API_JWT_ISSUER,
  INSTITUTE_SLUG_HEADER,
  isFlagOn,
} from '@slotwise/shared';
import { TimetableExportQuery } from '@slotwise/shared/timetable';
import { SignJWT } from 'jose';
import { headers } from 'next/headers';
import { auth } from '@/auth';
import { env } from '@/lib/env';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * `/timetable/export?version=&format=&kind=&id=`: passes a PDF or Excel download from the API
 * through to the browser. `api()` reads JSON only, so this signs the same short-lived token
 * itself (requests/2026-10-27-p2t-api-file-helper.md asks INT for an `apiFile()` in lib/api.ts).
 */
export async function GET(request: Request): Promise<Response> {
  if (!isFlagOn('P2T')) return new Response('Not found', { status: 404 });
  const url = new URL(request.url);
  const version = url.searchParams.get('version') ?? '';
  const query = TimetableExportQuery.safeParse({
    format: url.searchParams.get('format'),
    kind: url.searchParams.get('kind'),
    id: url.searchParams.get('id') || undefined,
  });
  if (!UUID.test(version) || !query.success) {
    return new Response('This download link is not complete.', { status: 400 });
  }
  const [session, slug] = await Promise.all([auth(), (await headers()).get(INSTITUTE_SLUG_HEADER)]);
  if (!session?.user?.id) return Response.redirect(new URL('/sign-in', url), 303);

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.user.id)
    .setIssuer(API_JWT_ISSUER)
    .setAudience(API_JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(env().API_JWT_SECRET));
  const params = new URLSearchParams({ format: query.data.format, kind: query.data.kind });
  if (query.data.id) params.set('id', query.data.id);

  let res: Response;
  try {
    res = await fetch(`${env().API_URL}/timetable/versions/${version}/export?${params}`, {
      headers: {
        authorization: `Bearer ${token}`,
        ...(slug ? { [INSTITUTE_SLUG_HEADER]: slug } : {}),
      },
      cache: 'no-store',
    });
  } catch {
    return new Response('Slotwise can’t be reached right now. Please try again in a minute.', {
      status: 503,
    });
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
    const message =
      typeof body?.message === 'string' ? body.message : 'Something went wrong. Please try again.';
    return new Response(message, {
      status: res.status,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return new Response(res.body, {
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
      'content-disposition': res.headers.get('content-disposition') ?? 'attachment',
      'cache-control': 'no-store',
    },
  });
}
