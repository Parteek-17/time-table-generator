/** Header the web app uses to tell the API which institute a request is for. */
export const INSTITUTE_SLUG_HEADER = 'x-institute-slug';

/** JWT claims shared by the web app (signer) and the API (verifier). */
export const API_JWT_ISSUER = 'slotwise-web';
export const API_JWT_AUDIENCE = 'slotwise-api';

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Subdomains that are never institute slugs. */
export const RESERVED_SUBDOMAINS: readonly string[] = ['www', 'app', 'api', 'admin', 'mail', 'static'];

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && !RESERVED_SUBDOMAINS.includes(slug);
}

/**
 * Extracts the institute slug from a Host header.
 *   parseInstituteSlug('demo.localhost:3000', 'localhost') → 'demo'
 *   parseInstituteSlug('demo.slotwise.app', 'slotwise.app') → 'demo'
 *   parseInstituteSlug('localhost:3000', 'localhost') → null
 */
export function parseInstituteSlug(host: string | null | undefined, rootDomain: string): string | null {
  if (!host) return null;
  const hostname = host.split(':')[0]!.toLowerCase();
  const root = rootDomain.split(':')[0]!.toLowerCase();
  if (hostname === root || !hostname.endsWith(`.${root}`)) return null;
  const sub = hostname.slice(0, -(root.length + 1));
  if (sub.includes('.')) return null;
  return isValidSlug(sub) ? sub : null;
}
