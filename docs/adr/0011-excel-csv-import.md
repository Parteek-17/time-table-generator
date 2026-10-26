# ADR 0011: Excel/CSV import with templates

- Status: accepted
- Date: 2026-10-27
- Milestone: 1d (docs/phase1/plan.md §7)

## Context

Colleges already keep their master data in Excel. CLAUDE.md asks us to start from their
files: auto-detect columns, preview, flag bad rows in plain language, fix them inline, and
let a new admin publish a timetable from their own sheets in under an hour. The plan has an
`ImportJob` / `ImportRow` pair (1a), BullMQ (`QueueService`) and the compose `storage`
service (S3 API).

## Decisions

1. **One template definition per kind, in `packages/shared/src/domain/imports.ts`.** Nine
   kinds: departments, programmes (one row per branch), courses, rooms, faculty, batches and
   sections, students, holidays, teaching assignments. Each column has its label, the names
   colleges use for it (synonyms for `matchHeaders()`), one line of help, an example and,
   for choices, the allowed values. The API builds the `.xlsx` from it with ExcelJS: an
   empty sheet with the headers (required ones shaded, a note with the help, drop-downs for
   choices) and a **How to fill** sheet. The web shows the same labels in the preview.
   The help text is English in code for now; it moves to message files with Hindi/Punjabi.

2. **Reading.** `.xlsx` through ExcelJS (first sheet that is not "How to fill"); `.csv`/`.tsv`
   through our own small RFC 4180 parser instead of ExcelJS's CSV reader, so roll numbers
   like `0012` and codes stay text. Old `.xls` is refused with "save it as .xlsx". The header
   row is the one of the first 10 rows that matches the most template columns, so a title
   row above the headers is fine. Every cell becomes text (dates as `yyyy-mm-dd`, formulas
   as their result); the row number is Excel's. Dates are read day-first (`20-10-2026`,
   `20/10/26`, `20 Oct 2026`), as Indian sheets write them.

3. **Rows are stored as text** (`ImportRow.data`, keyed by template column). An inline fix
   edits text; nothing is converted until a row is checked. If a required column is not
   found, the job waits in `mapping` and the admin picks the file's column for it.

4. **One plan per kind for preview and commit** (`apps/api/src/imports/kinds.ts`). `plan()`
   turns a row into the entity's input, finds the existing row by **natural key**, validates
   with the entity's own zod schema, checks `can()` for the owning department, and returns
   problems (column + plain message) plus what committing will do: `create`, `update` or
   `unchanged`. The commit calls the same `plan()` again and then its `write()`, so the
   preview never promises something the commit does differently. Writes go through
   `MasterDataService.createIn/updateIn` (new: the existing create/update inside a
   transaction the caller holds), so each row gets the usual reference checks and audit
   entry. Cohorts (created with a new batch's first section, like "Generate cohorts") and
   teaching assignments (no generic write path until 1e) are written in `kinds.ts` with
   the same `can()` rule and their own audit entries.

5. **Re-import updates by natural key; blank cells keep what is stored.** Keys: department
   code; programme code + branch code; programme + scheme + course code; room code;
   employee code; programme + branch + admission year + entry + section (in the term); class
   roll number; date + holiday name; class + section + sub-group + course + L/T/P (in the
   term). A blank optional cell never clears a stored value, so a sheet with fewer columns
   is safe to import. Clearing a value is done on the screen. Two rows with the same key in
   one file: the later one is flagged "Same as row N".

6. **Commit is all or nothing.** All rows are written in one transaction. If a row fails
   (data changed since the preview, say a department was archived), nothing is imported,
   that row gets the reason and the job goes back to the preview with "Nothing was
   imported: row N could not be saved. …". Skipped rows are counted, never written. The
   summary (created, updated, unchanged, skipped) is stored on the job and in the
   `import.committed` audit entry.

7. **Big files in the background.** Files over `IMPORT_BACKGROUND_ROWS` (1,000) rows are
   read and checked, and later committed, on the `p1.imports` queue. The worker rebuilds
   the uploader's `Tenant` from their current memberships, so a revoked role stops the
   job. Progress is written to `ImportJob.progress`; the page refreshes every 2 seconds.
   Like the sample-data queue, the worker starts on the first job under `NODE_ENV=test`.
   Limits: 5 MB, 20,000 rows per file.

8. **Storage.** `StorageService` (in `imports/` for now) stores uploads under
   `imports/<instituteId>/<jobId>/<file name>`: S3-compatible storage when `S3_ENDPOINT` and
   `S3_BUCKET` are set (the compose `storage` service locally, R2/S3 in production; the
   bucket is created on first use), otherwise a folder in the OS temp directory. That
   fallback is refused in production; it keeps CI, which has no storage service, working.
   Files are kept; a lifecycle rule to delete old uploads is a later chore.

9. **Upload transport.** The file is the raw body of `POST /imports?kind=&fileName=&termId=`
   (`application/octet-stream`, read with our own 5 MB limit), because the API's JSON body
   limit is 100 KB. The web posts the form to a route handler (`/imports/upload`; server
   actions accept at most 1 MB), which forwards the bytes. That handler signs the API
   token itself because `lib/api.ts` only sends JSON
   (`requests/2026-10-27-p1-api-raw-upload.md`). Templates come back base64 in JSON and are
   served by `/imports/templates/[kind]`.

10. **Permissions.** `import.run` (admin, hod, timetable coordinator) opens the feature.
    Every row is then checked with the action of what it writes (`department.manage`,
    `faculty.manage`, `cohort.manage`, `teaching.manage` …) for its department, at preview
    and again at commit. A hod importing an ECE row sees "You can’t change ECE department’s
    data. Ask the ECE head or your institute admin." on that row only.

## Workarounds until INT changes shared files

- `import_rows.action` only allows `create | update | skip` (1a's CHECK). An unchanged row is
  stored as `update` with `$same = '1'` in its data, stripped from the API
  (`requests/2026-10-27-p1-import-row-unchanged.md`).

## Not in 1d

- Elective sections and elective teaching assignments (sheets target sections and
  sub-groups only). Elective students come with the elective-section screen.
- FET files (`fet` import kind, milestone 1f).
- Undoing a whole import. Each row is audited and can be archived on its page.
