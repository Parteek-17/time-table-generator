# Migration, RLS and purge order for the P4 rescheduling tables

- Stream: P4
- Streams affected: INT (migration, purge list), all streams' local databases
- Files: `packages/db/prisma/migrations/<new>_p4_reschedule/migration.sql`,
  `packages/db/src/purge.ts`

## What

1. Write the migration for `packages/db/prisma/schema/reschedule.prisma` (three tables:
   `disruptions`, `cancellations`, `make_ups`; two enums `disruption_kind`,
   `disruption_scope`) plus the back-relation lines on `Institute` (core.prisma) and `Term`
   (setup.prisma). `prisma migrate diff` against a database at `main` shows only additions.
2. Append the SQL below: RLS on the three tables and a few CHECKs.
3. Add the three tables to `TENANT_TABLES_DELETE_ORDER` (before `terms` and `institutes`) so
   `purgeInstitute()` and `packages/db/test/rls.test.ts` cover them.

## Why

Streams never write migrations. Until this lands, CI has no rescheduling tables (P4's API e2e
tests skip themselves there, as P2T's did), and locally `rls.test.ts` "every table with
institute_id…" fails on a database that has them (`prisma db push`) because the purge list
doesn't name them. Design: `docs/adr/0060-disruptions-cancellations-make-ups.md`.

## Exact proposed diff

`packages/db/src/purge.ts`:

```diff
 export const TENANT_TABLES_DELETE_ORDER = [
   'import_rows',
   'import_jobs',
+  'make_ups',
+  'cancellations',
+  'disruptions',
   'timetable_slots',
```

SQL to append to the generated migration (tested locally on `slotwise_p4` after
`prisma db push`):

```sql
-- P4: row-level security and integrity rules for the rescheduling tables.
-- See docs/adr/0002-tenancy-and-rls.md and docs/adr/0060-disruptions-cancellations-make-ups.md.

-- 1. Row-level security (same policy as the other tenant tables).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['disruptions', 'cancellations', 'make_ups']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (institute_id = app_current_institute_id())
         WITH CHECK (institute_id = app_current_institute_id())',
      t
    );
  END LOOP;
END
$$;

-- 2. A disruption names exactly the id its scope needs, ends on or after its start, and has
-- either no times (whole day) or a start before its end.
ALTER TABLE "disruptions" ADD CONSTRAINT disruptions_scope CHECK (
  (scope_type = 'institute' AND department_id IS NULL AND section_id IS NULL)
  OR (scope_type = 'department' AND department_id IS NOT NULL AND section_id IS NULL)
  OR (scope_type = 'section' AND section_id IS NOT NULL)
);
ALTER TABLE "disruptions" ADD CONSTRAINT disruptions_kind_ids CHECK (
  (kind <> 'faculty_leave' OR faculty_id IS NOT NULL)
  AND (kind <> 'room_unavailable' OR room_id IS NOT NULL)
);
ALTER TABLE "disruptions" ADD CONSTRAINT disruptions_dates CHECK (end_date >= start_date);
ALTER TABLE "disruptions" ADD CONSTRAINT disruptions_times CHECK (
  (start_minute IS NULL AND end_minute IS NULL)
  OR (start_minute BETWEEN 0 AND 1440 AND end_minute BETWEEN 0 AND 1440
      AND start_minute < end_minute)
);

-- 3. Sane class values.
ALTER TABLE "cancellations" ADD CONSTRAINT cancellations_periods CHECK (periods >= 1);
ALTER TABLE "make_ups" ADD CONSTRAINT make_ups_cell CHECK (
  start_period >= 1 AND length >= 1
  AND start_minute BETWEEN 0 AND 1440 AND end_minute BETWEEN start_minute AND 1440
);
```
