# ADR 0009: One write path for master data, config-driven screens

- Status: accepted
- Date: 2026-10-22

## Context

Milestone 1b adds about twenty master-data entities (programmes, courses, terms, holidays,
sections, faculty, rooms …), each needing list, create, edit, archive and restore, with a
`can()` check, reference checks across tenants (ADR 0007) and an audit entry on every write.
Writing each one by hand would mean twenty slightly different copies of the same security
logic.

## Decision

**API: one entity definition per table, one service for every write.**

- `apps/api/src/masterdata/entity.ts` describes an entity: its zod schema (from
  `packages/shared`), the department that owns a row (for `can()`), the referenced ids to check
  inside the tenant transaction (`requireRefs`), how to map input to Prisma data, child/join rows
  to rewrite, and how to turn a row back into its editable input (the base of the DTO).
- `MasterDataService` runs every create/update/archive/restore in one tenant transaction:
  resolve the owning department → `can()` → reference checks → write → audit entry
  (`<entity>.<created|updated|archived|restored>`, with the changed fields). Moving a row to
  another department needs rights on both. Unique and check violations become plain messages.
- `crudController(def)` generates the standard routes. Updates are **PUT with the whole
  object**, so cross-field rules are validated on the complete value.
- Nested or special cases have their own code but reuse the same service: sections (sub-groups
  synced by name and archived, never deleted), bell schedules (periods and breaks rewritten),
  cohorts (generate from batches, override semester, lateral entry joining), promote batches,
  faculty availability (self-only rule) and bulk load limits, pasted holidays.
- Domain modules (`institute`, `academics`, `cohorts`, `faculty`, `infrastructure`,
  `calendar`) only list controllers; a global `CoreModule` provides Prisma, audit, mail and the
  master-data service.

**Web: config-driven list and form, custom screens where the task needs it.**

- `EntityList` (search, inline edit, archive with Undo, restore archived) and `EntityForm`
  (fields from a spec; numbers, times, lists and weekday chips converted to JSON; field errors
  from the API shown under each field) cover most pages. Pages are server components that load
  data and work out which rows the user may edit with `can()`; the client only hides controls.
- Custom screens: bell schedule builder, availability grid (tap to toggle, copy a day), section
  editor with sub-groups and "split evenly", promote preview.
- Writes go through generic server actions that only accept master-data paths
  (`/resource[/uuid][/action]`), so they are not a general proxy to the API. The API checks every
  call again.
- A route group `(app)` gives every signed-in page the same shell with navigation built from
  `canSomewhere()`; the home and members pages use it too.

## Consequences

- Adding an entity is a definition plus a page config; security and audit come for free, and
  `apps/api/test/masterdata.e2e.test.ts` checks that every write leaves an audit entry.
- Some forms show every field at once (e.g. a course); conditional fields (`show`) keep them
  short, but the setup wizard (1c) will present the same data one task per screen.
- TanStack Table is not used yet: lists are short enough for cards with search. Revisit for the
  teaching-assignment grid (1e) and large student lists.
- No logo upload yet: it needs object storage, which arrives with Excel import (1d).
