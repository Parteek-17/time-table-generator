# Migration, RLS and purge order for the P2T timetable tables

- Stream: P2T
- Streams affected: INT (migration, purge list), all streams' local databases
- Files: `packages/db/prisma/migrations/<new>_p2t_timetable/migration.sql`,
  `packages/db/src/purge.ts`

## What

1. Write the migration for `packages/db/prisma/schema/timetable.prisma` (four tables:
   `timetable_snapshots`, `timetable_versions`, `timetable_slots`, `timetable_solve_jobs`, two
   enums) plus the back-relation lines on `Institute`, `Term` and `TimetableScope`.
2. Append the SQL below to that migration: RLS, one published version per (term, scope),
   unique version numbers, and the trigger that keeps published slots immutable.
3. Add the four tables to `TENANT_TABLES_DELETE_ORDER` so `purgeInstitute()` and the RLS test
   (`packages/db/test/rls.test.ts`, "purgeInstitute() must know every tenant table") cover them.

## Why

Streams never write migrations. Until this lands, CI has no timetable tables (P2T's API e2e
test skips itself there), and locally `rls.test.ts` fails on a database that has the tables
(`prisma db push`) because the purge list doesn't name them. Design: `docs/adr/0050-timetable-versions-and-slots.md`.

## Exact proposed diff

`packages/db/src/purge.ts`:

```diff
 export const TENANT_TABLES_DELETE_ORDER = [
   'import_rows',
   'import_jobs',
+  'timetable_slots',
+  'timetable_versions',
+  'timetable_solve_jobs',
+  'timetable_snapshots',
   'timetable_scope_cohorts',
   'timetable_scopes',
```

SQL to append to the generated migration (tested locally on `slotwise_p2t` after `prisma db push`):

```sql
-- P2T: row-level security and integrity rules for the timetable tables.
-- See docs/adr/0002-tenancy-and-rls.md and docs/adr/0050-timetable-versions-and-slots.md.

-- 1. Row-level security (same policy as Phase 1's master-data tables).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'timetable_snapshots', 'timetable_versions', 'timetable_slots', 'timetable_solve_jobs'
  ]
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

-- 2. At most one published version per (term, scope); numbers unique per (term, scope).
CREATE UNIQUE INDEX timetable_versions_one_published
  ON "timetable_versions" (term_id, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'published';
CREATE UNIQUE INDEX timetable_versions_number
  ON "timetable_versions" (term_id, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), number)
  WHERE number IS NOT NULL;

-- 3. Only draft versions have their slots changed. Published and archived versions are
-- immutable (CLAUDE.md). A slot deleted because its version is deleted (purge) passes:
-- the version row is already gone.
CREATE FUNCTION timetable_slots_draft_only() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_status timetable_version_status;
BEGIN
  SELECT status INTO v_status FROM timetable_versions
   WHERE id = COALESCE(NEW.version_id, OLD.version_id);
  IF v_status IS NOT NULL AND v_status <> 'draft' THEN
    RAISE EXCEPTION 'Published timetables cannot be changed; edit a new draft instead.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$$;
CREATE TRIGGER timetable_slots_draft_only
  BEFORE INSERT OR UPDATE OR DELETE ON "timetable_slots"
  FOR EACH ROW EXECUTE FUNCTION timetable_slots_draft_only();

-- 4. Sane slot values.
ALTER TABLE "timetable_slots" ADD CONSTRAINT timetable_slots_cell CHECK (
  weekday BETWEEN 1 AND 7 AND start_period >= 1 AND length >= 1
  AND start_minute BETWEEN 0 AND 1440 AND end_minute BETWEEN start_minute AND 1440
);
ALTER TABLE "timetable_solve_jobs" ADD CONSTRAINT timetable_solve_jobs_progress
  CHECK (progress BETWEEN 0 AND 100);
```
