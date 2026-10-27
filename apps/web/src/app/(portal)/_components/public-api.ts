import 'server-only';
import { INSTITUTE_SLUG_HEADER } from '@slotwise/shared';
import { headers } from 'next/headers';
import { getInstituteSlug } from '@/lib/api';
import { env } from '@/lib/env';

export type PublicResult =
  { ok: true; res: Response } | { ok: false; status: number; message: string };

/**
 * Calls one of the API's public P5 routes without the visitor's sign-in: a public link must
 * read the same for everyone, including people signed in at another institute.
 */
export async function publicApi(path: string): Promise<PublicResult> {
  const slug = await getInstituteSlug();
  const requestHeaders: Record<string, string> = {};
  if (slug) requestHeaders[INSTITUTE_SLUG_HEADER] = slug;
  let res: Response;
  try {
    res = await fetch(`${env().API_URL}${path}`, { headers: requestHeaders, cache: 'no-store' });
  } catch {
    return {
      ok: false,
      status: 503,
      message: 'Slotwise can’t be reached right now. Please try again in a minute.',
    };
  }
  if (res.ok) return { ok: true, res };
  const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
  return {
    ok: false,
    status: res.status,
    message:
      typeof body?.message === 'string' ? body.message : 'Something went wrong. Please try again.',
  };
}

/** The full address of a path on this institute's site, e.g. for QR codes and calendar apps. */
export async function absoluteUrl(path: string): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const local = /^(localhost|[\w-]+\.localhost)(:\d+)?$/.test(host);
  const proto = h.get('x-forwarded-proto') ?? (local ? 'http' : 'https');
  return `${proto}://${host}${path}`;
}
