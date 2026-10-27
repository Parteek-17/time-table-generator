# ADR 0090: Sign-up, platform admins, plans and limits

- Status: proposed (P7)
- Date: 2026-10-27

## Context

Slotwise is sold to institutes. P7 needs: a platform admin who creates institutes, a public
sign-up that does the same, and plans that limit how much an institute holds. Creating the
institute is INT's institute-provisioning.v1 (`POST /platform/institutes`); P7 builds on it.

## Decision

**Platform admin check through can().** `canManagePlatform(user)` (packages/shared/src/auth,
in INT's request) is `can(user, 'institute.manage', PLATFORM_RESOURCE)`, where the resource's
institute id is the nil UUID. Only a platform-scope membership covers an institute that is
nobody's; institute, university and department scopes are tied to real ids. No new action, no
role string checks. `PlatformAdminGuard` loads the caller's platform memberships (RLS shows a
user their own memberships with no institute set) and is used on every `/platform/*` route.

**Sign-up is provisioning acting as the platform.** `POST /signup` (public, `@SkipTenant()`)
validates with `signupSchema`, then calls `InstituteProvisioningService` with
`actorUserId: null`. The person signing up is the first admin; they get an invite email and
become a member only by following it, which proves the address is theirs. Abuse limits: a
hidden honeypot field, at most 3 sign-ups per email per day and 60 per hour overall
(in-memory, per API process; move to Redis when the API scales out). The marketing site and
sign-up live on the bare domain (`/welcome`, `/signup`); the root `/` stays INT's page.

**Plans are code, an institute's plan is a row.** `PLANS` in `@slotwise/shared/platform`:
`trial` (30 days; 3 departments, 12 sections, 60 faculty, 800 students), `college` (15, 120,
400, 6000) and `university` (no limits). `institute_subscriptions` (platform.prisma) holds one
row per institute: plan code and last trial day (`date`, no time zone). P7 listens to
`institute.created` and gives every new institute the trial; a missing row counts as the trial
too, so a failed listener never unlocks anything. Platform admins change plans with
`PUT /platform/institutes/:id/plan` (audited as `billing.plan_changed`). Unknown codes in the
table fall back to the default plan.

**Limits are checked where things are created.** `BillingService.assertCanAdd(tx,
instituteId, kind, adding)` refuses with 403 `{ code: 'plan_limit', message }` in plain words.
Calling it from P1's create and import routes is a follow-up request to P1. Admins see their
plan and usage at `GET /billing/plan` ("nearly full" from 80%).

**Platform list reads plans per institute.** Subscriptions are an RLS-protected tenant table,
so the platform list (50 newest, searchable) reads each institute's row in its own tenant
transaction. Fine for tens of institutes per page; revisit with a platform read role if the
list grows.

## Consequences

- Payments are out of scope: paid plans are set by a platform admin after an offline invoice.
- The trial does not yet lock anything when it ends; `trialDaysLeft` is there for a banner and
  a later read-only mode.
- The `institute.created` event has no plan code (contracts are frozen); the console sets a
  non-default plan right after provisioning.
