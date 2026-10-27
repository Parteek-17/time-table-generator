import { isFlagOn } from '@slotwise/shared';
import { publicApi } from '../../_components/public-api';

const TOKEN = /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{22}\.ics$/;

/**
 * `/ical/<token>.ics`: a person's calendar feed for Google Calendar and phone calendars.
 * No sign-in (calendar apps can't); the signed token is the key (ADR 0071).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<Response> {
  const { file } = await params;
  if (!isFlagOn('P5') || !TOKEN.test(file)) return new Response('Not found', { status: 404 });
  const res = await publicApi(`/portal/feed/${file}`);
  if (!res.ok) return new Response(res.message, { status: res.status === 404 ? 404 : 502 });
  return new Response(await res.res.text(), {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'cache-control': 'private, max-age=900',
    },
  });
}
