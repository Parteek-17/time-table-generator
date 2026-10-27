import { isFlagOn } from '@slotwise/shared';
import { TimetableExportQuery } from '@slotwise/shared/timetable';
import { auth } from '@/auth';
import { apiFile } from '@/lib/api';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * `/timetable/export?version=&format=&kind=&id=`: passes a PDF or Excel download from the API
 * through to the browser.
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
  const session = await auth();
  if (!session?.user?.id) return Response.redirect(new URL('/sign-in', url), 303);

  const params = new URLSearchParams({ format: query.data.format, kind: query.data.kind });
  if (query.data.id) params.set('id', query.data.id);

  const res = await apiFile(`/timetable/versions/${version}/export?${params}`);
  if (res.status === 503 && res.headers.get('content-type')?.startsWith('text/plain')) return res;
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
