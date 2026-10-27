-- CreateEnum
CREATE TYPE "timetable_version_status" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "solve_job_status" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "timetable_snapshots" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "hash" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetable_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_versions" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "scope_id" UUID,
    "cohort_ids" UUID[],
    "number" INTEGER,
    "status" "timetable_version_status" NOT NULL DEFAULT 'draft',
    "parent_id" UUID,
    "snapshot_id" UUID NOT NULL,
    "solve_job_id" UUID,
    "unplaced" JSONB NOT NULL DEFAULT '[]',
    "score" JSONB,
    "created_by_id" UUID NOT NULL,
    "published_by_id" UUID,
    "published_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "valid_from" DATE,
    "valid_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_slots" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "session_id" TEXT NOT NULL,
    "assignment_id" UUID NOT NULL,
    "component" "component" NOT NULL,
    "course_id" UUID NOT NULL,
    "course_code" TEXT NOT NULL,
    "course_short_name" TEXT NOT NULL,
    "course_title" TEXT NOT NULL,
    "target_kind" "assignment_target" NOT NULL,
    "target_id" UUID NOT NULL,
    "target_name" TEXT NOT NULL,
    "section_ids" UUID[],
    "faculty_ids" UUID[],
    "faculty" JSONB NOT NULL,
    "room_id" UUID,
    "room_code" TEXT,
    "weekday" INTEGER NOT NULL,
    "start_period" INTEGER NOT NULL,
    "length" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_solve_jobs" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "scope_id" UUID,
    "cohort_ids" UUID[],
    "options" JSONB NOT NULL DEFAULT '{}',
    "status" "solve_job_status" NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "request_hash" TEXT,
    "snapshot_id" UUID,
    "base_version_id" UUID,
    "result_summary" JSONB,
    "error" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "timetable_solve_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timetable_snapshots_term_id_idx" ON "timetable_snapshots"("term_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_snapshots_institute_id_hash_key" ON "timetable_snapshots"("institute_id", "hash");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_versions_solve_job_id_key" ON "timetable_versions"("solve_job_id");

-- CreateIndex
CREATE INDEX "timetable_versions_institute_id_idx" ON "timetable_versions"("institute_id");

-- CreateIndex
CREATE INDEX "timetable_versions_term_id_status_idx" ON "timetable_versions"("term_id", "status");

-- CreateIndex
CREATE INDEX "timetable_slots_version_id_weekday_start_period_idx" ON "timetable_slots"("version_id", "weekday", "start_period");

-- CreateIndex
CREATE INDEX "timetable_slots_institute_id_idx" ON "timetable_slots"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_slots_version_id_session_id_key" ON "timetable_slots"("version_id", "session_id");

-- CreateIndex
CREATE INDEX "timetable_solve_jobs_institute_id_idx" ON "timetable_solve_jobs"("institute_id");

-- CreateIndex
CREATE INDEX "timetable_solve_jobs_term_id_created_at_idx" ON "timetable_solve_jobs"("term_id", "created_at");

-- AddForeignKey
ALTER TABLE "timetable_snapshots" ADD CONSTRAINT "timetable_snapshots_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_snapshots" ADD CONSTRAINT "timetable_snapshots_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_versions" ADD CONSTRAINT "timetable_versions_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_versions" ADD CONSTRAINT "timetable_versions_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_versions" ADD CONSTRAINT "timetable_versions_scope_id_fkey" FOREIGN KEY ("scope_id") REFERENCES "timetable_scopes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_versions" ADD CONSTRAINT "timetable_versions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "timetable_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_versions" ADD CONSTRAINT "timetable_versions_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "timetable_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_versions" ADD CONSTRAINT "timetable_versions_solve_job_id_fkey" FOREIGN KEY ("solve_job_id") REFERENCES "timetable_solve_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "timetable_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_solve_jobs" ADD CONSTRAINT "timetable_solve_jobs_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_solve_jobs" ADD CONSTRAINT "timetable_solve_jobs_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_solve_jobs" ADD CONSTRAINT "timetable_solve_jobs_scope_id_fkey" FOREIGN KEY ("scope_id") REFERENCES "timetable_scopes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_solve_jobs" ADD CONSTRAINT "timetable_solve_jobs_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "timetable_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
