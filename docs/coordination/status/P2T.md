# P2T status

## Current milestone

2T-d — editing, locks, re-solve, undo/redo, Not placed: done (branch `p2t/schema`, rebased
onto `main` with C0, P1 1b+/1c and INT's 2026-10-26 fixes). Lint, typecheck, ownership pass;
shared 198 and API 77 tests pass against `slotwise_p2t`.

Known local failure until INT merges P2T: `packages/db` `rls.test.ts` "every table with
institute_id…" expects P2T's four tables in `TENANT_TABLES_DELETE_ORDER` (INT's `purge.ts`,
part of the migration request). RLS itself is on for them. CI is not affected (its database has
no P2T tables yet).

## Done

- 2T-a: `timetable.prisma` (snapshots, versions, slots, solve jobs; back-relations on
  Institute, Term, TimetableScope), ADR 0050. RLS + integrity SQL handed to INT (request below).
- `@slotwise/shared/timetable`: `slotsFromPlacements()` (solver placements → slot rows with
  names copied from the snapshot), `slotIsFor()` / `readResponse()` (timetable-read.v1 shape).
  Reproduces `demo-term.published-timetable.json` from the snapshot + solution fixtures.
- `GET /terms/:termId/timetable` (timetable-read.v1) behind `@FeatureFlag('P2T')`, permission
  `timetable.view`; drafts never returned; responses parsed with the contract.
- `seed/p2t.ts`: publishes version 1 of the demo term from the fixtures (394 classes, 20 not
  placed).
- 2T-b: `POST /terms/:termId/timetable/generate` (202, `timetable.edit` for every department of
  the scope's cohorts; a second click follows the running job), `GET /timetable/jobs/:jobId`
  (progress 0–100, plain-language error), `GET /terms/:termId/timetable/jobs`,
  `GET /terms/:termId/timetable/versions` (everyone who reads timetables; drafts for editors).
- BullMQ queue `p2t.solve` (`timetable/jobs/solve.worker.ts`): snapshot (fixture or P1's route,
  called as the coordinator) → stored snapshot → solver (mock or HTTP) → draft version.
  Other scopes' published slots go in as `busySlots` (`busySlotsFrom()` in shared). The worker
  starts with the API, or on first enqueue under tests (CI has no Redis).
- 2T-c: `/timetable` — term and version pickers, view by section, lab group, teacher or room
  (kept in the URL), week grid with breaks and spanning lab blocks (md and up), day view on
  phones (opens on today), draft/older-version notes, loading skeleton, error screen.
  `/timetable/generate` — classes (timetable group) and search time, progress bar that polls the
  job, then "Open the draft"; resumes a run after reload. Nav: Timetables for `timetable.view`,
  Generate for `timetable.edit`.
- API for the screens: `GET /timetable/versions/:versionId/view?kind=&id=` (drafts for editors
  only; bell schedule and pick-lists from the version's snapshot) and
  `GET /terms/:termId/timetable/scopes`. Shared `gridColumns()` / `dayCells()` / `viewChoices()` / `viewBell()`.
- Checked in the browser: desktop (dark), 400px (light), all four view kinds, generate → draft.

- 2T-d: one clash checker for API and web (`TimetableChecker` in `@slotwise/shared/timetable`:
  bell schedule, long breaks, fixed slots, section / lab group / elective clashes, teacher
  clashes, unavailability, day limits, other published timetables; picks a free suitable room).
  `POST /timetable/versions/:id/edits` (move with optional preferred room, lock; drafts only;
  409 + reasons), `GET .../editor`, `POST .../copy`. Re-solve the rest = generate with
  `baseVersionId` (locked classes go in as `lockedSessions`; new draft's parent is the base).
  Web: drag and drop (dnd-kit) with valid periods highlighted and the reason shown in words, a
  Move menu for keyboard and touch, Lock/Unlock, Undo/Redo (buttons, Ctrl+Z / Ctrl+Y), "Make an
  editable copy" on published versions, "Not placed" panel with plain reasons and links to the
  setup screens (by URL). Checked in the browser: refused drop, Move, room change, undo back to
  the old room, redo, lock, reload keeps both.

- 2T-e: `POST /timetable/versions/:id/publish` (permission `timetable.publish` for every
  department in it): the current version is archived (validTo = day before), the draft gets the
  next number and validFrom = today in the institute's timezone (kept inside the term);
  `timetable.version.archived` and exactly one `timetable.published` go out after commit
  (advisory lock per term and group, so a double click or two coordinators give one event;
  `sectionIds` = sections whose week changed, all of them on a first publish).
  `POST .../undo-publish`: the undone version is archived, the one it replaced is published
  again (same events), and its classes come back as a new draft — published versions never
  change. Shared `changedSections()`, `publishValidFrom()`.
  `GET .../export?format=pdf|xlsx&kind=&id=`: one week, or every section / lab group / teacher /
  room (a sheet or page each). One table model (`exportTable()`, `tableToCsv()`,
  `slotDetails()` in shared) behind PDF (puppeteer-core + Chrome/Edge), Excel (ExcelJS, lab
  blocks merged, A4 landscape) and Copy as CSV (built in the browser with the translated
  labels; shows the text to copy by hand when the clipboard is blocked).
  Web: Publish button on drafts (no confirm), "Published as version N" notice with Undo,
  downloads panel; web route `/timetable/export` passes files through.
  Fix: the solve worker lost drafts to Prisma's 5 s interactive-transaction limit on this
  laptop; it now saves in one batch transaction, and copy / publish / undo use a 30 s tenant
  transaction (`tenant-tx.ts`) until INT adds a timeout option.
  Tests: API e2e `timetable-publish` (6) and `timetable-export` (5), shared `publish` /
  `export` unit tests, Playwright `e2e/p2t/publish.spec.ts` (generate → move → publish → undo →
  publish → Excel, PDF, CSV). Checked in the browser at 400px: Publish, the notice, Undo, Copy
  as CSV fallback, all three downloads through the web route. The PDF layout itself was not
  looked at by eye (the preview pane doesn't render PDFs).

## Next

- 2T-f (proposed): section names repeat in pick-lists and export sheet names ("BCA A" ×3 —
  same display name in different semesters); show programme/semester with the name.
- PDF exports are English-only (`EXPORT_LABELS_EN`); pass the web's labels when Hindi lands.

## Blocked by

- Nothing for 2T-e. CI runs the timetable API e2e tests only after INT's migration (they skip
  themselves until the tables exist).

## New dependencies

- `apps/api`: `ioredis` 5.11.1 (BullMQ 6's optional peer; without it `QueueService` hangs).
- `apps/web`: `@dnd-kit/core` 6.3.1 (timetable drag and drop).
- `apps/api`: `exceljs` 4.4.0, `puppeteer-core` 25.12.0 (no bundled browser; uses Chrome/Edge).

## Env variables added

- API, read in `timetable/timetable.config.ts` (all optional): `SNAPSHOT_SOURCE` (`fixture` |
  `api`, default `fixture`), `SOLVER_SOURCE` (`mock` | `http`, default `mock`),
  `SOLVER_MOCK_DELAY_MS` (default 3000), `PDF_BROWSER_PATH` (Chrome/Edge for PDFs; empty = the
  usual install places; the API host needs Chromium). `SOLVER_URL` already existed.

## Contract change requests

None. Open requests:

- `requests/2026-10-23-p2t-timetable-migration.md` — migration + RLS SQL, purge order (INT).
- `requests/2026-10-23-p2t-seed-uses-stream-database.md` — `pnpm db:seed` in a worktree writes
  to the main database (INT). Fixed on `main` by `packages/db/src/load-env.ts` (P1's request);
  INT can move this one to `done/` on merge.
- `requests/2026-10-23-p2t-deterministic-sample-ids.md` — fixtures' ids don't exist in a
  seeded database (P1, INT).
- `requests/2026-10-23-p2t-env-variables.md` — P2T settings in `.env.example` (INT).
- `requests/2026-10-27-p2t-api-file-helper.md` — `apiFile()` in the web's `lib/api.ts`;
  `PDF_BROWSER_PATH` in `.env.example`, Chromium on the API host (INT).
- `requests/2026-10-27-p2t-tenant-transaction-timeout.md` — timeout option for `withTenant()`
  (INT).
- `requests/2026-10-23-p2t-ui-timetable-grid.md` — `TimetableGrid`, `SlotCard`, segmented
  control, progress bar, skeleton for the kit (UI); a launch.json entry for stream ports (INT).

## Notes for other streams

- P4/P5: `timetable.published` is sent after commit, once per publish and once when Undo
  re-publishes the previous version (with `previousVersionId` = the undone one). Key on
  `eventId`; `validFrom` is the first date to use the new version.
- Published slots carry copies of course/audience/faculty/room names (ADR 0050); P4/P5/P6
  should read through `timetable-read.v1`, never the tables.
- The demo term's published timetable uses the fixture's section/faculty/room ids until the
  deterministic-ids request lands.
- `ioredis` 5.11.1 is on `main` now too (P1 added the same version).
- `/terms/:termId/timetable/scopes` reads P1's timetable_scopes table (read-only) until P1 has
  a list route; P2T will switch to it.

## Last pushed

Not pushed yet.
