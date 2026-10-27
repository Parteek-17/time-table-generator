# Migration, RLS and purge order for the P6 exam tables

- Stream: P6
- Streams affected: INT (migration, purge list), all streams' local databases
- Files: `packages/db/prisma/migrations/<new>_p6_exams/migration.sql`, `packages/db/src/purge.ts`

## What

1. Write the migration for `packages/db/prisma/schema/exams.prisma` (seven tables: `exams`,
   `exam_sessions`, `exam_papers`, `exam_seat_needs`, `seating_plans`, `seat_assignments`,
   `invigilation_duties`; two enums `exam_status`, `seating_plan_status`) plus the
   back-relation lines on `Institute`, `Term`, `Course` and `Student`.
2. Append the SQL below to that migration: RLS on all seven tables, one published seating plan
   per session, the trigger that keeps a published plan's seats and duties unchanged, and
   value checks.
3. Add the seven tables to `TENANT_TABLES_DELETE_ORDER`, before `students` and `courses`.

## Why

Streams never write migrations. Until this lands, CI has no exam tables (P6's API e2e tests
skip themselves there) and `purgeInstitute()` fails on an institute with exam rows (P6's tests
call `purgeExams()` from `apps/api/src/exams/exams.fixtures.ts` first; drop that once this is
in). Design: `docs/adr/0080-exams-date-sheet-and-seating.md`.

## Exact proposed diff

`packages/db/src/purge.ts`:

```diff
 export const TENANT_TABLES_DELETE_ORDER = [
   'import_rows',
   'import_jobs',
+  // Plans before their seats and duties (ON DELETE CASCADE passes the published-plan trigger).
+  'seating_plans',
+  'seat_assignments',
+  'invigilation_duties',
+  'exam_papers',
+  'exam_sessions',
+  'exams',
+  'exam_seat_needs',
   // Versions before slots: their slots go with them (ON DELETE CASCADE), which the
```

SQL to append to the generated migration (tested locally on `slotwise_p6` after `prisma db push`):

```sql
-- P6: row-level security and integrity rules for the exam tables.
-- See docs/adr/0002-tenancy-and-rls.md and docs/adr/0080-exams-date-sheet-and-seating.md.

-- 1. Row-level security (same policy as the other tenant tables).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'exams', 'exam_sessions', 'exam_papers', 'exam_seat_needs',
    'seating_plans', 'seat_assignments', 'invigilation_duties'
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

-- 2. At most one published seating plan per exam session.
CREATE UNIQUE INDEX seating_plans_one_published
  ON "seating_plans" (session_id) WHERE status = 'published';

-- 3. Seats and duties of a published plan never change (publish a new plan instead).
-- Rows deleted because their plan is deleted (purge) pass: the plan row is already gone.
CREATE FUNCTION seating_rows_unpublished_only() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_status seating_plan_status;
BEGIN
  SELECT status INTO v_status FROM seating_plans
   WHERE id = COALESCE(NEW.plan_id, OLD.plan_id);
  IF v_status = 'published' THEN
    RAISE EXCEPTION 'A published seating plan cannot be changed; build a new plan instead.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$$;
CREATE TRIGGER seat_assignments_unpublished_only
  BEFORE INSERT OR UPDATE OR DELETE ON "seat_assignments"
  FOR EACH ROW EXECUTE FUNCTION seating_rows_unpublished_only();
CREATE TRIGGER invigilation_duties_unpublished_only
  BEFORE INSERT OR UPDATE OR DELETE ON "invigilation_duties"
  FOR EACH ROW EXECUTE FUNCTION seating_rows_unpublished_only();

-- 4. Sane values.
ALTER TABLE "exams" ADD CONSTRAINT exams_settings CHECK (
  reserve_seats_per_hall >= 0 AND students_per_invigilator >= 1 AND min_invigilators_per_hall >= 1
);
ALTER TABLE "exam_sessions" ADD CONSTRAINT exam_sessions_time CHECK (
  start_minute BETWEEN 0 AND 1440 AND end_minute > start_minute AND end_minute <= 1440
);
ALTER TABLE "seat_assignments" ADD CONSTRAINT seat_assignments_cell CHECK (
  "row" >= 1 AND "column" >= 1
);
```
