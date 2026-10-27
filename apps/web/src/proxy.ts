import { INSTITUTE_SLUG_HEADER, parseInstituteSlug } from '@slotwise/shared';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Resolves the institute from the subdomain (demo.localhost:3000 → "demo") and passes it on
 * as a request header. Server code forwards it to the API, which checks membership.
 * Any incoming value is dropped first, so a browser can never choose its own institute.
 */
export function proxy(request: NextRequest) {
  // x-forwarded-host first: Vercel sets it, and Next's internal re-render after a server
  // action redirect arrives with Host: localhost but keeps x-forwarded-host. Trusting it is
  // safe because the slug only selects an institute; the API still checks membership.
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  // SINGLE_INSTITUTE_SLUG: one institute on a plain address (e.g. a free *.vercel.app demo
  // where subdomains aren't available). Real subdomains still win.
  const slug =
    parseInstituteSlug(host, process.env.WEB_ROOT_DOMAIN ?? 'localhost') ??
    process.env.SINGLE_INSTITUTE_SLUG ??
    null;
  const headers = new Headers(request.headers);
  headers.delete(INSTITUTE_SLUG_HEADER);
  if (slug) headers.set(INSTITUTE_SLUG_HEADER, slug);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
