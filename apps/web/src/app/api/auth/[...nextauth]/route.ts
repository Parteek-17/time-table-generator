import { NextRequest } from 'next/server';
import { handlers } from '@/auth';

/**
 * Auth.js builds redirect URLs from request.url. Behind some servers (including `next dev`)
 * that URL carries the server's own hostname instead of the institute subdomain the user is
 * on, so after clicking a magic link they would land on the bare domain without a session.
 * Rebuild the URL from the Host header (already trusted: AUTH_TRUST_HOST=true).
 */
function onRequestHost(req: NextRequest): NextRequest {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!host) return req;
  const url = new URL(req.url);
  url.host = host;
  const proto = req.headers.get('x-forwarded-proto');
  if (proto === 'http' || proto === 'https') url.protocol = `${proto}:`;
  return url.href === req.url ? req : new NextRequest(url, req);
}

export const GET = (req: NextRequest) => handlers.GET(onRequestHost(req));
export const POST = (req: NextRequest) => handlers.POST(onRequestHost(req));
