# ADR 0006: Invites, revoking and undo

- Status: accepted
- Date: 2026-10-21

## Decision

- **Tokens:** 32 random bytes (base64url) in the link; only the SHA-256 hash is stored.
  Invites expire after `INVITE_TTL_DAYS` (default 7). A new invite for the same email, role
  and scope cancels the earlier pending one.
- **Preview is public** (`GET /invites/token/:token`) so the page can greet the person and
  pre-fill their email before they sign in. It only works on the inviting institute's
  subdomain (RLS hides it elsewhere).
- **Accepting requires signing in with the invited email.** It creates the membership and
  marks the invite accepted in one transaction, with an audit entry.
- **Revoke is a soft delete** (`revoked_at`) and is **undoable** (`POST /members/:id/restore`),
  following "Undo instead of confirm". Nobody can revoke their own membership.
- **Who can invite whom** is data, not code: `ASSIGNABLE_ROLES` in
  `packages/shared/src/auth/permissions.ts`. Institute admins can grant any institute role; a
  hod can grant timetable_coordinator, faculty and student in their own department.
- **Audit log** entries: `invite.created`, `invite.cancelled`, `invite.accepted`,
  `membership.revoked`, `membership.restored`, written in the same transaction as the change.
