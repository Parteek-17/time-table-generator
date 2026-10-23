/**
 * Institute provisioning v1: create an institute and invite its first admin.
 *
 * `POST /platform/institutes` on the API (relative to API_URL), platform_admin only (or the
 * self-serve sign-up flow acting as the platform). Implemented by INT in
 * apps/api/src/institute-provisioning on top of Phase 0's institute and invite code; called by
 * P7 (platform screens, sign-up). Emits `institute.created` (events.v1).
 */
import { z } from 'zod';
import { isValidSlug } from '../tenancy';
import { Id, IsoDateTime } from './common.v1';

export const INSTITUTE_PROVISIONING_V1 = 'institute-provisioning.v1' as const;

export const ProvisionInstituteRequestV1 = z.object({
  /** Always "institute-provisioning.v1". */
  version: z.literal(INSTITUTE_PROVISIONING_V1),
  /** Display name, e.g. "Demo Institute of Engineering". */
  name: z.string().trim().min(3).max(120),
  /** Subdomain, valid per isValidSlug() (not reserved). Becomes `<slug>.slotwise.app`. */
  slug: z.string().refine(isValidSlug, 'Use lower-case letters, digits and hyphens.'),
  /** college or university. */
  type: z.enum(['college', 'university']),
  /** IANA time zone. */
  timezone: z.string().default('Asia/Kolkata'),
  /** Affiliating university's name, for affiliated colleges. */
  affiliatingUniversityName: z.string().trim().max(160).nullable().default(null),
  /** First institute admin: gets an email invite. */
  firstAdmin: z.object({
    /** Their email. */
    email: z.email(),
    /** Their name. */
    name: z.string().trim().min(1).max(120),
  }),
  /** Load the fictional sample data so they can try it straight away. */
  withSampleData: z.boolean().default(false),
  /** Plan code from P7's billing (e.g. "trial"); null = default plan. */
  planCode: z.string().nullable().default(null),
});

export const ProvisionInstituteResponseV1 = z.object({
  /** Always "institute-provisioning.v1". */
  version: z.literal(INSTITUTE_PROVISIONING_V1),
  /** New institute. */
  instituteId: Id,
  /** Its slug. */
  slug: z.string(),
  /** Its address, e.g. "https://demo.slotwise.app". */
  url: z.url(),
  /** The admin's user id (created if new). */
  firstAdminUserId: Id,
  /** The invite sent to them. */
  inviteId: Id,
  /** When the invite expires. */
  inviteExpiresAt: IsoDateTime,
});

/** Plain-language refusals the API returns as `{ code, message }` with status 409 or 400. */
export const PROVISIONING_ERRORS_V1 = ['slug_taken', 'slug_reserved', 'invalid_input'] as const;

export type ProvisionInstituteRequestV1 = z.infer<typeof ProvisionInstituteRequestV1>;
export type ProvisionInstituteRequestV1Input = z.input<typeof ProvisionInstituteRequestV1>;
export type ProvisionInstituteResponseV1 = z.infer<typeof ProvisionInstituteResponseV1>;

export const INSTITUTE_PROVISIONING_V1_ROUTE = '/platform/institutes' as const;
