# Contract: resolve notification recipients to people (recipients.v1)

- Stream: P4
- Streams affected: INT (contract file, CONTRACTS.md), P1 (implements: owns faculty and
  students), P5/P6 (may use it)
- Files: `packages/shared/src/contracts/recipients.v1.ts` (new), `contracts/index.ts`,
  `docs/coordination/CONTRACTS.md`; implementation in P1's API

## What

`notify.v1` lets any stream address a notification to `sectionIds`, `subGroupIds`,
`facultyIds` and `userIds`. P4's notify module has to turn those into people with an email
address, but faculty→user links and students' sections are P1's tables and users are INT's, so
P4 may not read them. Proposed: an in-API route P4 calls as a system job (or as the user who
caused the notification), returning only what sending needs.

## Why

Last part of P4's milestone 4 (email for cancellations and make-ups). Without it, notify would
have to read P1's tables (against OWNERSHIP/CONTRACTS) or send nothing. P5 (portal push) and P6
(seat notices) will need the same lookup.

## Exact proposed diff

New `packages/shared/src/contracts/recipients.v1.ts`:

```ts
/**
 * Recipients v1: who a notification reaches. `POST /people/recipients` on the API.
 * Producer: P1. Consumers: P4 (notify), later P5, P6.
 */
import { z } from 'zod';
import { Id } from './common.v1';

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

export const RecipientV1 = z.object({
  /** User id; null for a student or teacher without a login yet (email from the roll list). */
  userId: Id.nullable(),
  /** Where to send email; null when none is known. */
  email: z.email().nullable(),
  /** Display name, for the greeting. */
  name: z.string(),
  /** student or faculty (or staff, for userIds). */
  kind: z.enum(['student', 'faculty', 'staff']),
});

export const RecipientsResponseV1 = z.object({
  contract: z.literal(RECIPIENTS_V1),
  /** De-duplicated by email (then userId). */
  recipients: z.array(RecipientV1),
});
```

Permission: callable only by members who may `timetable.edit` somewhere in the institute (the
coordinator whose change caused the notification), never by students or faculty.

## Addendum (2026-10-28): who calls it

P4 now calls this route from its notify worker, signed as the user whose action caused the
notification (`actorUserId` of the event). `notify.requested` from other streams carries no user
(notify.v1 has no actor field), so those are not delivered yet. Proposed with this request: INT
adds a service identity (e.g. a `system` token the API accepts only from itself) or a
`requestedByUserId` field in a `notify.v2`. P4's adapter is
`apps/api/src/notify/recipients.source.ts`; until the route exists it answers 404 and notify
sends nothing (logged once). P4's local copy of the schemas is
`packages/shared/src/reschedule/recipients.ts`, deleted once the contract file lands.
