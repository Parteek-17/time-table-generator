import { z } from 'zod';
import { isValidSlug } from '../tenancy';
import { PLAN_CODES, type UsageItem } from './plans';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-12-31.');

/**
 * Public sign-up form (apps/web/src/app/(marketing)/signup → `POST /signup`). Becomes an
 * institute-provisioning.v1 request on the trial plan.
 */
export const signupSchema = z.object({
  instituteName: z.string().trim().min(3, 'Enter your institute’s full name.').max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isValidSlug, 'Use lower-case letters, digits and hyphens, e.g. demo-engg.'),
  type: z.enum(['college', 'university']),
  affiliatingUniversityName: z
    .string()
    .trim()
    .max(160)
    .transform((v) => v || null)
    .nullable()
    .default(null),
  adminName: z.string().trim().min(1, 'Enter your name.').max(120),
  adminEmail: z.email('Enter an email address you can open now.').toLowerCase(),
  /** Hidden field people never fill in; bots do. Anything in it is refused. */
  website: z.string().max(0).optional(),
});
export type SignupInput = z.input<typeof signupSchema>;
export type Signup = z.infer<typeof signupSchema>;

export interface SignupResponse {
  /** The new address, e.g. https://demo-engg.slotwise.app. */
  url: string;
  slug: string;
  /** Where the invite went. */
  email: string;
}

export const setPlanSchema = z.object({
  planCode: z.enum(PLAN_CODES),
  /** Last trial day; null = no end (paid plans). Omitted = the plan's default. */
  trialEndsOn: isoDate.nullable().optional(),
});
export type SetPlanInput = z.infer<typeof setPlanSchema>;

export interface PlatformInstituteDto {
  id: string;
  name: string;
  slug: string;
  type: 'college' | 'university';
  isSample: boolean;
  createdAt: string;
  url: string;
  plan: { code: string; name: string; trialEndsOn: string | null } | null;
}

export interface PlanStatusDto {
  plan: { code: string; name: string };
  trialEndsOn: string | null;
  /** Null when there is no trial. */
  trialDaysLeft: number | null;
  usage: UsageItem[];
}

/**
 * Suggests a subdomain from the institute's name: "Demo Institute of Engineering" →
 * "demo-institute-of-engineering", cut at a word boundary to at most 30 characters.
 */
export function suggestSlug(name: string): string {
  const words = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);
  let slug = '';
  for (const word of words) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > 30) break;
    slug = next;
  }
  if (!slug) slug = (words[0] ?? '').slice(0, 30);
  return isValidSlug(slug) ? slug : '';
}
