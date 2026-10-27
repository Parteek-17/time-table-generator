# 0060 — Disruptions, cancellations and make-ups

- Status: accepted (P4, 2026-10-27)
- Stream: P4 — Rescheduling

## Context

CLAUDE.md: holidays and events cancel overlapping classes for their scope; a make-up slot must
be free for section, faculty and a suitable room (same week first, then the next); syllabus
coverage = delivered vs syllabus hours. P4 may read other streams' data only through contracts:
the term's setup (`setup-snapshot.v1`, P1) and published timetables (`timetable-read.v1`, P2T).

## Decision

**Names.** CLAUDE.md calls the thing that cancels classes an _Event_; the frozen `events.v1`
contract calls it a _disruption_ (`disruption.created`, kinds `holiday | event | faculty_leave |
room_unavailable | other`). The table is `disruptions` to match the contract and to avoid
confusion with domain events. Screens say "holiday" or "event".

**Tables** (`reschedule.prisma`, all with `institute_id` and the usual RLS policy):

- `disruptions` — kind, title, scope (institute / department / section), optional teacher
  (leave), dates and optional hours. Undo sets `deleted_at` (kept for history).
- `cancellations` — one class (published slot id) on one date. Unique per
  (institute, slot, date): a class is cancelled once, however many disruptions cover it. Keeps
  a copy of the published `TimetableSlotV1`, plus `section_ids` / `faculty_ids` / `course_id`
  / `periods` for lookups, so it reads the same after a newer version is published. Slot,
  section, faculty and room ids are plain uuids (no foreign keys into P1/P2T tables).
- `make_ups` — one per cancellation (cascade-deleted with it).

**Reading other streams' data.** `TermSource` calls P1's snapshot route and P2T's read route
over HTTP inside the same API, signed as the user (as P2T reads P1's snapshot), so their
permission checks apply. A holiday for the institute reads every section's week (4 requests at
a time); a department event only its sections; leave reads one teacher's week.
`RESCHEDULE_SOURCE=fixture` uses the demo fixtures instead.

**Which classes a disruption hits** (`classesHit()` in `@slotwise/shared/reschedule`, pure):
the class's audience is in scope (any of its sections, for classes shared across departments;
the teacher for leave), its hours overlap (whole day if none given), and it actually meets on
the date: right weekday (an extra working day follows the weekday it names), inside the term,
the cohort's teaching window and the published version's dates, and not on a setup holiday or
non-teaching window (nothing to cancel there).

**Undo.** Undoing a disruption gives back each class it cancelled unless another active
disruption also covers it; then the cancellation moves to that one (its reason changes with it).
A class cancelled by hand is undone on its own; a class cancelled by a disruption comes back
only by undoing the disruption.

**Permissions** (`can()` with existing actions, no new ones): changes need `timetable.edit`
(timetable coordinator, HOD, institute admin) on the scope — institute-wide grants for an
institute holiday, the department for a department event, the section's department for a
section, the teacher's home department for leave, every department of a class's sections for a
single class. Reading cancellations needs `timetable.view` (everyone who reads timetables).

**Events.** After the commit: one `disruption.created` per disruption and one `class.cancelled`
per newly cancelled class. There is no contract event for a class given back yet (a
`class.restored` v1 event would be an additive contract request when P5 needs it).

## Consequences

- A newer published timetable does not move existing cancellations onto its slots yet; P4 will
  listen to `timetable.published` and re-apply active disruptions from the new version's
  `validFrom` (follow-up).
- `room_unavailable` is in the enum (contract) but not offered: it should move classes to
  another room rather than cancel them.
