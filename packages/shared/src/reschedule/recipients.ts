/**
 * P4's copy of the proposed `recipients.v1` contract (requests/2026-10-27-p4-recipients-contract.md):
 * who a notification reaches. Lives here until INT adds `contracts/recipients.v1.ts` and P1
 * implements `POST /people/recipients`; then P4 imports the contract and deletes this file.
 */
import { z } from 'zod';
import { Id } from '../contracts';

export const RECIPIENTS_V1 = 'recipients.v1' as const;
export const RECIPIENTS_V1_ROUTE = '/people/recipients' as const;

export const RecipientsQueryV1 = z.object({
  /** Every student of these sections, and the section's class in-charge, if any. */
  sectionIds: z.array(Id).default([]),
  /** Every student of these sub-groups. */
  subGroupIds: z.array(Id).default([]),
  /** These faculty members (via their linked user). */
  facultyIds: z.array(Id).default([]),
  /** Specific users. */
  userIds: z.array(Id).default([]),
});
export type RecipientsQueryV1 = z.input<typeof RecipientsQueryV1>;

export const RecipientV1 = z.object({
  /** User id; null for a student or teacher without a login yet. */
  userId: Id.nullable(),
  /** Where to send email; null when none is known. */
  email: z.email().nullable(),
  /** Display name, for the greeting. */
  name: z.string(),
  /** student, faculty or staff. */
  kind: z.enum(['student', 'faculty', 'staff']),
});
export type RecipientV1 = z.infer<typeof RecipientV1>;

export const RecipientsResponseV1 = z.object({
  contract: z.literal(RECIPIENTS_V1),
  /** De-duplicated by email (then userId). */
  recipients: z.array(RecipientV1),
});
export type RecipientsResponseV1 = z.infer<typeof RecipientsResponseV1>;

/** People with an email address, once each (case-insensitive), in the order given. */
export function emailRecipients(
  recipients: readonly RecipientV1[],
): (RecipientV1 & { email: string })[] {
  const seen = new Set<string>();
  const out: (RecipientV1 & { email: string })[] = [];
  for (const r of recipients) {
    if (!r.email) continue;
    const key = r.email.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...r, email: r.email.trim() });
  }
  return out;
}
