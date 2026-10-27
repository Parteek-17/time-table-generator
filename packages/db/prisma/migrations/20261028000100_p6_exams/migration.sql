-- CreateEnum
CREATE TYPE "exam_status" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "seating_plan_status" AS ENUM ('queued', 'running', 'ready', 'failed', 'published', 'archived');

-- CreateTable
CREATE TABLE "exams" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "exam_status" NOT NULL DEFAULT 'draft',
    "reserve_seats_per_hall" INTEGER NOT NULL DEFAULT 0,
    "students_per_invigilator" INTEGER NOT NULL DEFAULT 30,
    "min_invigilators_per_hall" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_sessions" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_papers" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "section_ids" UUID[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_seat_needs" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_seat_needs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seating_plans" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "status" "seating_plan_status" NOT NULL DEFAULT 'queued',
    "hall_ids" UUID[],
    "solver_status" TEXT,
    "problems" JSONB NOT NULL DEFAULT '{}',
    "halls" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "created_by_id" UUID NOT NULL,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seating_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seat_assignments" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "roll_no" TEXT NOT NULL,
    "paper_id" UUID NOT NULL,
    "paper_code" TEXT NOT NULL,
    "hall_id" UUID NOT NULL,
    "hall_code" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "column" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seat_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invigilation_duties" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "faculty_id" UUID NOT NULL,
    "faculty_name" TEXT NOT NULL,
    "hall_id" UUID NOT NULL,
    "hall_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invigilation_duties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invigilator_unavailability" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "faculty_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invigilator_unavailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exams_institute_id_idx" ON "exams"("institute_id");

-- CreateIndex
CREATE INDEX "exams_term_id_idx" ON "exams"("term_id");

-- CreateIndex
CREATE INDEX "exam_sessions_institute_id_idx" ON "exam_sessions"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_sessions_exam_id_date_label_key" ON "exam_sessions"("exam_id", "date", "label");

-- CreateIndex
CREATE INDEX "exam_papers_session_id_idx" ON "exam_papers"("session_id");

-- CreateIndex
CREATE INDEX "exam_papers_institute_id_idx" ON "exam_papers"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_papers_exam_id_course_id_key" ON "exam_papers"("exam_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_seat_needs_institute_id_student_id_key" ON "exam_seat_needs"("institute_id", "student_id");

-- CreateIndex
CREATE INDEX "seating_plans_session_id_idx" ON "seating_plans"("session_id");

-- CreateIndex
CREATE INDEX "seating_plans_institute_id_idx" ON "seating_plans"("institute_id");

-- CreateIndex
CREATE INDEX "seat_assignments_student_id_idx" ON "seat_assignments"("student_id");

-- CreateIndex
CREATE INDEX "seat_assignments_institute_id_idx" ON "seat_assignments"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "seat_assignments_plan_id_student_id_key" ON "seat_assignments"("plan_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "seat_assignments_plan_id_hall_id_row_column_key" ON "seat_assignments"("plan_id", "hall_id", "row", "column");

-- CreateIndex
CREATE INDEX "invigilation_duties_faculty_id_idx" ON "invigilation_duties"("faculty_id");

-- CreateIndex
CREATE INDEX "invigilation_duties_institute_id_idx" ON "invigilation_duties"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "invigilation_duties_plan_id_faculty_id_key" ON "invigilation_duties"("plan_id", "faculty_id");

-- CreateIndex
CREATE INDEX "invigilator_unavailability_institute_id_idx" ON "invigilator_unavailability"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "invigilator_unavailability_session_id_faculty_id_key" ON "invigilator_unavailability"("session_id", "faculty_id");

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_seat_needs" ADD CONSTRAINT "exam_seat_needs_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_seat_needs" ADD CONSTRAINT "exam_seat_needs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seating_plans" ADD CONSTRAINT "seating_plans_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seating_plans" ADD CONSTRAINT "seating_plans_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "seating_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invigilation_duties" ADD CONSTRAINT "invigilation_duties_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invigilation_duties" ADD CONSTRAINT "invigilation_duties_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "seating_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invigilator_unavailability" ADD CONSTRAINT "invigilator_unavailability_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invigilator_unavailability" ADD CONSTRAINT "invigilator_unavailability_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invigilator_unavailability" ADD CONSTRAINT "invigilator_unavailability_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- P6: row-level security and integrity rules for the exam tables.
-- See docs/adr/0002-tenancy-and-rls.md and docs/adr/0080-exams-date-sheet-and-seating.md.

-- 1. Row-level security (same policy as the other tenant tables).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'exams', 'exam_sessions', 'exam_papers', 'exam_seat_needs',
    'seating_plans', 'seat_assignments', 'invigilation_duties', 'invigilator_unavailability'
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
