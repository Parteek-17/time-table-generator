import {
  API_JWT_AUDIENCE,
  API_JWT_ISSUER,
  INSTITUTE_SLUG_HEADER,
  isFlagOn,
} from '@slotwise/shared';
import { ExamExportQuery } from '@slotwise/shared/exams';
import { SignJWT } from 'jose';
import { headers } from 'next/headers';
import { auth } from '@/auth';
import { env } from '@/lib/env';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * `/exams/download?plan=&doc=&format=`: passes a seating printout (PDF or Excel) from the API
 * through to the browser. `api()` reads JSON only, so this signs the same short-lived token
 * itself, as P2T's timetable download does (requests/2026-10-27-p2t-api-file-helper.md).
 */
export async function GET(request: Request): Promise<Response> {
  if (!isFlagOn('P6')) return new Response('Not found', { status: 404 });
  const url = new URL(request.url);
  const plan = url.searchParams.get('plan') ?? '';
  const query = ExamExportQuery.safeParse({
    doc: url.searchParams.get('doc'),
    format: url.searchParams.get('format'),
  });
  if (!UUID.test(plan) || !query.success) {
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
  const params = new URLSearchParams({ doc: query.data.doc, format: query.data.format });

  let res: Response;
  try {
    res = await fetch(`${env().API_URL}/exams/seating/${plan}/export?${params}`, {
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
