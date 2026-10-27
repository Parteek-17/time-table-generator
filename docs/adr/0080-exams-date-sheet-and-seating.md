# ADR 0080: Exams, date sheets and seating plans

- Status: accepted (P6, milestones 1–2)
- Date: 2026-10-27

## Context

P6 builds date sheets, exam seating plans and invigilation duties (CLAUDE.md "Exam seating
rules", build order phase 4). The solver contract `solver-seating.v1` is fixed: one request is
one exam session across the halls offered.

## Decision

**Tables** (`packages/db/prisma/schema/exams.prisma`), all with `institute_id` and the usual
`tenant_isolation` RLS policy:

- `exams`: an exam series of a term with its seating settings (reserve seats per hall,
  students per invigilator, minimum invigilators). Soft-deleted.
- `exam_sessions`: date + label (Morning/Evening) + minutes from midnight. Unique per
  (exam, date, label).
- `exam_papers`: a course written in a session by the students of `section_ids`. A course is
  on an exam's date sheet once (`exam_id` is copied from the session for that unique key).
  Who writes is derived from sections (active students), not stored per student, so the date
  sheet follows roll-list changes until seating is built.
- `exam_seat_needs`: students who need a ground-floor / front seat in every exam. Student
  records are P1's; a separate table keeps the need with P6 and out of P1's import.
- `seating_plans`, `seat_assignments`, `invigilation_duties`: a plan per session built by the
  solver from a background job. Seats and duties copy what they print (roll number, paper
  code, hall code, faculty name) and use plain uuids for master data, so a published plan never
  changes when master data is edited. One published plan per session; a trigger refuses changes
  to a published plan's seats and duties.

**Date-sheet clashes** (a section writing two papers in one session) are reported, not
refused, so a coordinator can build the sheet in any order; `dateSheetProblems()` in
`packages/shared/src/exams` words them.

**Seating** (`services/solver/src/slotwise_solver/seating`) is a greedy fill, not CP-SAT: halls
in `order`, front row first, left to right; at each seat it takes the paper with the most
students waiting among those not already to the left, right, front or back. Valid by
construction, deterministic and fast on small hosts. Roll numbers go up within each paper
(natural order: CS9 before CS10). Left/right counts across benches too. The reserve is a cap on
seats used per hall (capacity − reserve), so it comes out of seats the adjacency rule leaves
empty anyway. Students needing accessible seats are placed first in the front-most free seat of
an accessible hall, ground floor first. Unseated students get a reason and a plain message.

**The seating job** (`apps/api/src/exams/seating`, BullMQ queue `p6.seating`) builds the
request inside the API from the date sheet, active students of the papers' sections, seat
needs and rooms, reading P1's tables read-only through Prisma under RLS (no import of P1's
code). A room is a hall when it has rows, seats per row and exam seats per bench; class seats
per row are on two-seater benches, so `benchesPerRow = ceil(seatsPerRow / 2)`
(`hallFromRoom()`). Halls are the rooms the coordinator picked, in that order, or every exam
room, ground floor first. Roll numbers on seats are the university roll number, else the class
roll number. A section writing two papers in the session fails the job with a plain message.

**Permissions** go through `can()` with `exam.view` / `exam.manage`, requested from INT
(`requests/2026-10-27-p6-exam-permissions.md`); until then `apps/api/src/exams/exam-permissions.ts`
maps them to `masterdata.view` / `institute.manage`.

## Consequences

- A single-paper hall can only be half full; the response says so (`adjacency`).
- Purging an institute needs P6's tables in `TENANT_TABLES_DELETE_ORDER`
  (`requests/2026-10-27-p6-exams-migration.md`).
