# ADR 0050: Timetable versions, slots and the read API

- Status: accepted (P2T, milestone 2T-a)
- Date: 2026-10-23

## Context

P2T stores generated timetables, lets coordinators edit drafts and publish them, and serves
published ones to rescheduling (P4), portals (P5) and exams (P6) through `timetable-read.v1`.
CLAUDE.md asks that timetables are versioned (draft → published → archived), that published
versions never change, and that master data referenced by a published timetable is soft-deleted.

Until P1's `GET /terms/:termId/snapshot` lands, P2T builds on the shared fixtures, whose ids
are not the seeded database's ids.

## Decision

**Four tables** (`packages/db/prisma/schema/timetable.prisma`), all with `institute_id` and the
usual `tenant_isolation` RLS policy:

| Table                  | What                                                                  |
| ---------------------- | --------------------------------------------------------------------- |
| `timetable_snapshots`  | A `setup-snapshot.v1` document, stored once per (institute, hash).    |
| `timetable_versions`   | One timetable of a term (or timetable scope): status, number, parent. |
| `timetable_slots`      | One placed session of a version.                                      |
| `timetable_solve_jobs` | A background solve: snapshot → solver → draft version.                |

**Slots copy what they show.** A slot stores the course code, short name and title, the
audience name, the teachers' names and short codes and the room code, taken from the snapshot
the version was built from (`slotsFromPlacements()` in `@slotwise/shared/timetable`), plus
start and end minutes from the cohort's bell schedule. Master-data ids on slots (assignment,
course, audience, faculty, room) are plain uuids without foreign keys. So:

- a published version reads the same forever, even after a course is renamed or a room
  archived (CLAUDE.md: published versions are immutable);
- the read API needs no joins into P1's tables;
- versions built from fixtures work before the snapshot endpoint exists.

The snapshot itself is kept (`timetable_snapshots`) so later checks — clashes while dragging,
room fit, faculty limits, a sub-group's section — run against exactly the data the version was
built from.

**Versions.** `number` is set on publish (1, 2, 3 … per term and scope). `parentId` links an
edited or re-solved draft to the version it came from. `unplaced` keeps the solver's
`UnplacedSessionV1[]` for the "Not placed" panel; `score` keeps its penalties.

**Database rules** (SQL in `docs/coordination/requests/2026-10-23-p2t-timetable-migration.md`;
INT puts it in the migration):

- at most one `published` version per (term, scope), and version numbers unique per (term, scope);
- slots can only be inserted, changed or deleted while their version is a `draft` (trigger
  `timetable_slots_draft_only`). Publishing flips the version's status after its slots are
  written. Purging an institute still works: a slot deleted together with its version passes.

**Read API.** `GET /terms/:termId/timetable` (contract `timetable-read.v1`) in
`apps/api/src/timetable/`:

- permission `timetable.view` (everyone in the institute, students included), checked with
  `can()`;
- reads published versions, or a published or archived one by `versionId`; drafts are never
  returned (404 when asked for by id);
- a term with several scopes has one published version per scope: the newest one that has
  classes for the requested section, sub-group, faculty member or room is used;
- which slots belong to whom is decided by `slotIsFor()` in `@slotwise/shared/timetable` (SQL
  only narrows), and every response is parsed with `TimetableReadResponseV1` before it is sent.

## Consequences

- Renaming a course or room shows up in the next draft, not in published versions. That is
  intended; coordinators re-publish to pick up changes.
- Slot rows are wider (copies of names). A term is a few hundred slots per version, so this is
  small.
- Nothing stops a slot from naming a faculty id that no longer exists in master data. Editing
  checks validate against the version's snapshot instead.
- Until INT writes the migration, CI has no timetable tables: the API e2e test for the read API
  skips itself there (`apps/api/src/timetable/timetable-read.e2e.test.ts`). The pure parts are
  tested in `packages/shared/src/timetable/read.test.ts`, which runs everywhere.
