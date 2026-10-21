# ADR 0003: A minimal Department table in Phase 0

- Status: accepted
- Date: 2026-10-21

## Context

The Phase 0 brief lists only Institute, User, Membership, Invite and AuditLog, but the
acceptance test invites someone "as hod of a department scope". Without a department to point
at, `scope_id` would be a free-text id that nothing validates.

## Decision

Add `Department (id, institute_id, name, code, deleted_at)` now, with RLS like every tenant
table, and seed three departments for the demo institute (CSE, ECE, Applied Sciences). No
department management screens yet; they come with the setup wizard in Build step 1.

## Consequences

- Department-scoped roles (hod, timetable_coordinator, faculty) work end to end and
  `can()` scope inheritance is tested against real ids.
- The setup wizard will extend this table rather than introduce it.
