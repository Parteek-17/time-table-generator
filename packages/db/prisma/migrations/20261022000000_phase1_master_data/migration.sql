-- CreateEnum
CREATE TYPE "department_kind" AS ENUM ('teaching', 'service');

-- CreateEnum
CREATE TYPE "programme_level" AS ENUM ('ug', 'pg', 'diploma', 'doctoral');

-- CreateEnum
CREATE TYPE "study_mode" AS ENUM ('full_time', 'part_time');

-- CreateEnum
CREATE TYPE "scheme_status" AS ENUM ('draft', 'active', 'retired');

-- CreateEnum
CREATE TYPE "course_type" AS ENUM ('core', 'programme_elective', 'open_elective', 'mandatory', 'audit', 'lab', 'project', 'seminar', 'training', 'mooc');

-- CreateEnum
CREATE TYPE "grouped_by" AS ENUM ('section', 'subgroup');

-- CreateEnum
CREATE TYPE "term_kind" AS ENUM ('odd', 'even');

-- CreateEnum
CREATE TYPE "term_status" AS ENUM ('planning', 'active', 'closed');

-- CreateEnum
CREATE TYPE "entry_type" AS ENUM ('regular', 'lateral');

-- CreateEnum
CREATE TYPE "batch_status" AS ENUM ('active', 'graduated', 'discontinued');

-- CreateEnum
CREATE TYPE "calendar_window_type" AS ENUM ('mid_sem_exam', 'orientation', 'vacation', 'training', 'other');

-- CreateEnum
CREATE TYPE "calendar_scope" AS ENUM ('institute', 'department', 'programme', 'cohort', 'section');

-- CreateEnum
CREATE TYPE "fixed_slot_kind" AS ENUM ('mentoring', 'minor_degree', 'honours', 'remedial', 'library', 'sports_ncc', 'other');

-- CreateEnum
CREATE TYPE "student_status" AS ENUM ('active', 'detained', 'left');

-- CreateEnum
CREATE TYPE "designation" AS ENUM ('professor', 'associate_professor', 'assistant_professor', 'lecturer', 'teaching_assistant', 'visiting');

-- CreateEnum
CREATE TYPE "experience" AS ENUM ('experienced', 'fresher');

-- CreateEnum
CREATE TYPE "room_type" AS ENUM ('lecture', 'tutorial', 'lab', 'seminar', 'drawing_hall', 'workshop');

-- CreateEnum
CREATE TYPE "component" AS ENUM ('lecture', 'tutorial', 'practical');

-- CreateEnum
CREATE TYPE "assignment_target" AS ENUM ('section', 'subgroup', 'elective_section');

-- CreateEnum
CREATE TYPE "teacher_role" AS ENUM ('main', 'co_teacher', 'ta');

-- CreateEnum
CREATE TYPE "import_kind" AS ENUM ('departments', 'programmes', 'batches_sections', 'students', 'faculty', 'rooms', 'courses', 'holidays', 'teaching_assignments', 'fet');

-- CreateEnum
CREATE TYPE "import_status" AS ENUM ('uploaded', 'parsing', 'mapping', 'preview', 'committing', 'committed', 'failed', 'cancelled');

-- AlterTable
ALTER TABLE "institutes" ADD COLUMN     "affiliating_university_name" TEXT,
ADD COLUMN     "is_sample" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "logo_key" TEXT,
ADD COLUMN     "setup_state" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "kind" "department_kind" NOT NULL DEFAULT 'teaching';

-- CreateTable
CREATE TABLE "programmes" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" "programme_level" NOT NULL,
    "mode" "study_mode" NOT NULL DEFAULT 'full_time',
    "total_semesters" INTEGER NOT NULL,
    "lateral_entry_semester" INTEGER,
    "department_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "programmes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "programme_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department_id" UUID NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheme_versions" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "programme_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "scheme_status" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "scheme_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "scheme_version_id" UUID NOT NULL,
    "semester" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "lectures" INTEGER NOT NULL DEFAULT 0,
    "tutorials" INTEGER NOT NULL DEFAULT 0,
    "practicals" INTEGER NOT NULL DEFAULT 0,
    "credits_override" DECIMAL(4,1),
    "syllabus_hours" INTEGER,
    "type" "course_type" NOT NULL DEFAULT 'core',
    "elective_group" TEXT,
    "offering_department_id" UUID NOT NULL,
    "room_type" "room_type",
    "lab_category" TEXT,
    "lab_block_length" INTEGER NOT NULL DEFAULT 2,
    "is_scheduled" BOOLEAN NOT NULL DEFAULT true,
    "tutorial_by" "grouped_by" NOT NULL DEFAULT 'subgroup',
    "practical_by" "grouped_by" NOT NULL DEFAULT 'subgroup',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_branches" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,

    CONSTRAINT "course_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_sessions" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_year" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "academic_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "kind" "term_kind" NOT NULL,
    "label" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "min_teaching_days" INTEGER NOT NULL DEFAULT 90,
    "status" "term_status" NOT NULL DEFAULT 'planning',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "term_cohort_windows" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "programme_id" UUID NOT NULL,
    "semesters" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "entry_type" "entry_type",
    "teaching_start" DATE NOT NULL,
    "prep_holidays_start" DATE,
    "prep_holidays_end" DATE,
    "end_sem_exam_start" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "term_cohort_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_windows" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "type" "calendar_window_type" NOT NULL,
    "label" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "scope_type" "calendar_scope" NOT NULL DEFAULT 'institute',
    "department_id" UUID,
    "programme_id" UUID,
    "cohort_id" UUID,
    "section_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "calendar_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "scope_type" "calendar_scope" NOT NULL DEFAULT 'institute',
    "department_id" UUID,
    "programme_id" UUID,
    "cohort_id" UUID,
    "section_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extra_working_days" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "follows_weekday" INTEGER NOT NULL,
    "scope_type" "calendar_scope" NOT NULL DEFAULT 'institute',
    "department_id" UUID,
    "programme_id" UUID,
    "cohort_id" UUID,
    "section_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "extra_working_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bell_schedules" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "working_days" INTEGER[],
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "bell_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bell_periods" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "bell_schedule_id" UUID NOT NULL,
    "index" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,

    CONSTRAINT "bell_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bell_breaks" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "bell_schedule_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "after_period_index" INTEGER NOT NULL,
    "minutes" INTEGER NOT NULL,

    CONSTRAINT "bell_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bell_schedule_programmes" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "bell_schedule_id" UUID NOT NULL,
    "programme_id" UUID NOT NULL,
    "semesters" INTEGER[] DEFAULT ARRAY[]::INTEGER[],

    CONSTRAINT "bell_schedule_programmes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_slots" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "kind" "fixed_slot_kind" NOT NULL,
    "label" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_period_index" INTEGER NOT NULL,
    "end_period_index" INTEGER NOT NULL,
    "scope_type" "calendar_scope" NOT NULL DEFAULT 'institute',
    "department_id" UUID,
    "programme_id" UUID,
    "cohort_id" UUID,
    "section_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "fixed_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_slot_faculty" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "fixed_slot_id" UUID NOT NULL,
    "faculty_id" UUID NOT NULL,

    CONSTRAINT "fixed_slot_faculty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "programme_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "admission_year" INTEGER NOT NULL,
    "entry_type" "entry_type" NOT NULL DEFAULT 'regular',
    "scheme_version_id" UUID NOT NULL,
    "status" "batch_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cohorts" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "semester" INTEGER NOT NULL,
    "semester_overridden" BOOLEAN NOT NULL DEFAULT false,
    "is_running" BOOLEAN NOT NULL DEFAULT true,
    "display_code" TEXT NOT NULL,
    "joins_cohort_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cohorts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "cohort_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "strength" INTEGER NOT NULL,
    "home_room_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_groups" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "strength" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sub_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elective_sections" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "strength" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "elective_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elective_section_sources" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "elective_section_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,

    CONSTRAINT "elective_section_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "class_roll_no" TEXT NOT NULL,
    "university_roll_no" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "section_id" UUID,
    "sub_group_id" UUID,
    "status" "student_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_electives" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "elective_section_id" UUID NOT NULL,

    CONSTRAINT "student_electives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faculty" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "employee_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short_code" TEXT NOT NULL,
    "email" TEXT,
    "designation" "designation" NOT NULL,
    "experience" "experience" NOT NULL,
    "home_department_id" UUID NOT NULL,
    "max_periods_per_day" INTEGER NOT NULL,
    "max_periods_per_week" INTEGER NOT NULL,
    "user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "faculty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faculty_departments" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "faculty_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,

    CONSTRAINT "faculty_departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faculty_unavailability" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "faculty_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "period_index" INTEGER NOT NULL,
    "reason" TEXT,

    CONSTRAINT "faculty_unavailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "floors" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "building_id" UUID NOT NULL,
    "floor" INTEGER NOT NULL DEFAULT 0,
    "type" "room_type" NOT NULL,
    "lab_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rows" INTEGER,
    "seats_per_row" INTEGER,
    "capacity_override" INTEGER,
    "exam_seats_per_bench" INTEGER,
    "owner_department_id" UUID,
    "is_shared" BOOLEAN NOT NULL DEFAULT true,
    "is_accessible" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teaching_assignments" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "component" "component" NOT NULL,
    "target" "assignment_target" NOT NULL,
    "section_id" UUID,
    "sub_group_id" UUID,
    "elective_section_id" UUID,
    "preferred_room_id" UUID,
    "preferred_lab_category" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "teaching_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teaching_assignment_faculty" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "faculty_id" UUID NOT NULL,
    "role" "teacher_role" NOT NULL DEFAULT 'main',

    CONSTRAINT "teaching_assignment_faculty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_mentors" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "cohort_id" UUID NOT NULL,
    "faculty_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "subject_mentors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_scopes" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Main',
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "timetable_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_scope_cohorts" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "scope_id" UUID NOT NULL,
    "cohort_id" UUID NOT NULL,

    CONSTRAINT "timetable_scope_cohorts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "kind" "import_kind" NOT NULL,
    "status" "import_status" NOT NULL DEFAULT 'uploaded',
    "file_name" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "term_id" UUID,
    "column_mapping" JSONB NOT NULL DEFAULT '{}',
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "action" TEXT NOT NULL,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "programmes_institute_id_idx" ON "programmes"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "programmes_institute_id_code_key" ON "programmes"("institute_id", "code");

-- CreateIndex
CREATE INDEX "branches_institute_id_idx" ON "branches"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_programme_id_code_key" ON "branches"("programme_id", "code");

-- CreateIndex
CREATE INDEX "scheme_versions_institute_id_idx" ON "scheme_versions"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "scheme_versions_programme_id_name_key" ON "scheme_versions"("programme_id", "name");

-- CreateIndex
CREATE INDEX "courses_scheme_version_id_semester_idx" ON "courses"("scheme_version_id", "semester");

-- CreateIndex
CREATE INDEX "courses_institute_id_idx" ON "courses"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "courses_scheme_version_id_code_key" ON "courses"("scheme_version_id", "code");

-- CreateIndex
CREATE INDEX "course_branches_institute_id_idx" ON "course_branches"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_branches_course_id_branch_id_key" ON "course_branches"("course_id", "branch_id");

-- CreateIndex
CREATE INDEX "academic_sessions_institute_id_idx" ON "academic_sessions"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_sessions_institute_id_start_year_key" ON "academic_sessions"("institute_id", "start_year");

-- CreateIndex
CREATE INDEX "terms_institute_id_idx" ON "terms"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "terms_session_id_kind_key" ON "terms"("session_id", "kind");

-- CreateIndex
CREATE INDEX "term_cohort_windows_term_id_idx" ON "term_cohort_windows"("term_id");

-- CreateIndex
CREATE INDEX "term_cohort_windows_institute_id_idx" ON "term_cohort_windows"("institute_id");

-- CreateIndex
CREATE INDEX "calendar_windows_term_id_idx" ON "calendar_windows"("term_id");

-- CreateIndex
CREATE INDEX "calendar_windows_institute_id_idx" ON "calendar_windows"("institute_id");

-- CreateIndex
CREATE INDEX "holidays_institute_id_start_date_idx" ON "holidays"("institute_id", "start_date");

-- CreateIndex
CREATE INDEX "extra_working_days_term_id_idx" ON "extra_working_days"("term_id");

-- CreateIndex
CREATE INDEX "extra_working_days_institute_id_idx" ON "extra_working_days"("institute_id");

-- CreateIndex
CREATE INDEX "bell_schedules_institute_id_idx" ON "bell_schedules"("institute_id");

-- CreateIndex
CREATE INDEX "bell_periods_institute_id_idx" ON "bell_periods"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "bell_periods_bell_schedule_id_index_key" ON "bell_periods"("bell_schedule_id", "index");

-- CreateIndex
CREATE INDEX "bell_breaks_institute_id_idx" ON "bell_breaks"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "bell_breaks_bell_schedule_id_after_period_index_key" ON "bell_breaks"("bell_schedule_id", "after_period_index");

-- CreateIndex
CREATE INDEX "bell_schedule_programmes_institute_id_idx" ON "bell_schedule_programmes"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "bell_schedule_programmes_bell_schedule_id_programme_id_key" ON "bell_schedule_programmes"("bell_schedule_id", "programme_id");

-- CreateIndex
CREATE INDEX "fixed_slots_term_id_idx" ON "fixed_slots"("term_id");

-- CreateIndex
CREATE INDEX "fixed_slots_institute_id_idx" ON "fixed_slots"("institute_id");

-- CreateIndex
CREATE INDEX "fixed_slot_faculty_institute_id_idx" ON "fixed_slot_faculty"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_slot_faculty_fixed_slot_id_faculty_id_key" ON "fixed_slot_faculty"("fixed_slot_id", "faculty_id");

-- CreateIndex
CREATE INDEX "batches_institute_id_idx" ON "batches"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "batches_branch_id_admission_year_entry_type_key" ON "batches"("branch_id", "admission_year", "entry_type");

-- CreateIndex
CREATE INDEX "cohorts_term_id_idx" ON "cohorts"("term_id");

-- CreateIndex
CREATE INDEX "cohorts_institute_id_idx" ON "cohorts"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "cohorts_batch_id_term_id_key" ON "cohorts"("batch_id", "term_id");

-- CreateIndex
CREATE INDEX "sections_institute_id_idx" ON "sections"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "sections_cohort_id_name_key" ON "sections"("cohort_id", "name");

-- CreateIndex
CREATE INDEX "sub_groups_institute_id_idx" ON "sub_groups"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "sub_groups_section_id_name_key" ON "sub_groups"("section_id", "name");

-- CreateIndex
CREATE INDEX "elective_sections_institute_id_idx" ON "elective_sections"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "elective_sections_term_id_course_id_name_key" ON "elective_sections"("term_id", "course_id", "name");

-- CreateIndex
CREATE INDEX "elective_section_sources_institute_id_idx" ON "elective_section_sources"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "elective_section_sources_elective_section_id_section_id_key" ON "elective_section_sources"("elective_section_id", "section_id");

-- CreateIndex
CREATE INDEX "students_institute_id_idx" ON "students"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_institute_id_class_roll_no_key" ON "students"("institute_id", "class_roll_no");

-- CreateIndex
CREATE INDEX "student_electives_institute_id_idx" ON "student_electives"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_electives_student_id_elective_section_id_key" ON "student_electives"("student_id", "elective_section_id");

-- CreateIndex
CREATE INDEX "faculty_institute_id_idx" ON "faculty"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_institute_id_employee_code_key" ON "faculty"("institute_id", "employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_institute_id_short_code_key" ON "faculty"("institute_id", "short_code");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_institute_id_user_id_key" ON "faculty"("institute_id", "user_id");

-- CreateIndex
CREATE INDEX "faculty_departments_institute_id_idx" ON "faculty_departments"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_departments_faculty_id_department_id_key" ON "faculty_departments"("faculty_id", "department_id");

-- CreateIndex
CREATE INDEX "faculty_unavailability_institute_id_idx" ON "faculty_unavailability"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_unavailability_faculty_id_weekday_period_index_key" ON "faculty_unavailability"("faculty_id", "weekday", "period_index");

-- CreateIndex
CREATE INDEX "buildings_institute_id_idx" ON "buildings"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_institute_id_name_key" ON "buildings"("institute_id", "name");

-- CreateIndex
CREATE INDEX "rooms_institute_id_idx" ON "rooms"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_institute_id_code_key" ON "rooms"("institute_id", "code");

-- CreateIndex
CREATE INDEX "teaching_assignments_term_id_course_id_idx" ON "teaching_assignments"("term_id", "course_id");

-- CreateIndex
CREATE INDEX "teaching_assignments_institute_id_idx" ON "teaching_assignments"("institute_id");

-- CreateIndex
CREATE INDEX "teaching_assignment_faculty_faculty_id_idx" ON "teaching_assignment_faculty"("faculty_id");

-- CreateIndex
CREATE INDEX "teaching_assignment_faculty_institute_id_idx" ON "teaching_assignment_faculty"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "teaching_assignment_faculty_assignment_id_faculty_id_key" ON "teaching_assignment_faculty"("assignment_id", "faculty_id");

-- CreateIndex
CREATE INDEX "subject_mentors_institute_id_idx" ON "subject_mentors"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "subject_mentors_term_id_course_id_cohort_id_key" ON "subject_mentors"("term_id", "course_id", "cohort_id");

-- CreateIndex
CREATE INDEX "timetable_scopes_institute_id_idx" ON "timetable_scopes"("institute_id");

-- CreateIndex
CREATE INDEX "timetable_scope_cohorts_institute_id_idx" ON "timetable_scope_cohorts"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_scope_cohorts_scope_id_cohort_id_key" ON "timetable_scope_cohorts"("scope_id", "cohort_id");

-- CreateIndex
CREATE INDEX "import_jobs_institute_id_created_at_idx" ON "import_jobs"("institute_id", "created_at");

-- CreateIndex
CREATE INDEX "import_rows_institute_id_idx" ON "import_rows"("institute_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_job_id_row_number_key" ON "import_rows"("job_id", "row_number");

-- AddForeignKey
ALTER TABLE "programmes" ADD CONSTRAINT "programmes_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programmes" ADD CONSTRAINT "programmes_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheme_versions" ADD CONSTRAINT "scheme_versions_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheme_versions" ADD CONSTRAINT "scheme_versions_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_scheme_version_id_fkey" FOREIGN KEY ("scheme_version_id") REFERENCES "scheme_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_offering_department_id_fkey" FOREIGN KEY ("offering_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_branches" ADD CONSTRAINT "course_branches_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_branches" ADD CONSTRAINT "course_branches_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_branches" ADD CONSTRAINT "course_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms" ADD CONSTRAINT "terms_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms" ADD CONSTRAINT "terms_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_cohort_windows" ADD CONSTRAINT "term_cohort_windows_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_cohort_windows" ADD CONSTRAINT "term_cohort_windows_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_cohort_windows" ADD CONSTRAINT "term_cohort_windows_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_windows" ADD CONSTRAINT "calendar_windows_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_windows" ADD CONSTRAINT "calendar_windows_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_windows" ADD CONSTRAINT "calendar_windows_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_windows" ADD CONSTRAINT "calendar_windows_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_windows" ADD CONSTRAINT "calendar_windows_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "cohorts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_windows" ADD CONSTRAINT "calendar_windows_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "cohorts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_working_days" ADD CONSTRAINT "extra_working_days_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_working_days" ADD CONSTRAINT "extra_working_days_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_working_days" ADD CONSTRAINT "extra_working_days_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_working_days" ADD CONSTRAINT "extra_working_days_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_working_days" ADD CONSTRAINT "extra_working_days_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "cohorts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_working_days" ADD CONSTRAINT "extra_working_days_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bell_schedules" ADD CONSTRAINT "bell_schedules_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bell_periods" ADD CONSTRAINT "bell_periods_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bell_periods" ADD CONSTRAINT "bell_periods_bell_schedule_id_fkey" FOREIGN KEY ("bell_schedule_id") REFERENCES "bell_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bell_breaks" ADD CONSTRAINT "bell_breaks_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bell_breaks" ADD CONSTRAINT "bell_breaks_bell_schedule_id_fkey" FOREIGN KEY ("bell_schedule_id") REFERENCES "bell_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bell_schedule_programmes" ADD CONSTRAINT "bell_schedule_programmes_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bell_schedule_programmes" ADD CONSTRAINT "bell_schedule_programmes_bell_schedule_id_fkey" FOREIGN KEY ("bell_schedule_id") REFERENCES "bell_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bell_schedule_programmes" ADD CONSTRAINT "bell_schedule_programmes_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_slots" ADD CONSTRAINT "fixed_slots_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_slots" ADD CONSTRAINT "fixed_slots_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_slots" ADD CONSTRAINT "fixed_slots_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_slots" ADD CONSTRAINT "fixed_slots_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_slots" ADD CONSTRAINT "fixed_slots_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "cohorts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_slots" ADD CONSTRAINT "fixed_slots_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_slot_faculty" ADD CONSTRAINT "fixed_slot_faculty_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_slot_faculty" ADD CONSTRAINT "fixed_slot_faculty_fixed_slot_id_fkey" FOREIGN KEY ("fixed_slot_id") REFERENCES "fixed_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_slot_faculty" ADD CONSTRAINT "fixed_slot_faculty_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_scheme_version_id_fkey" FOREIGN KEY ("scheme_version_id") REFERENCES "scheme_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_joins_cohort_id_fkey" FOREIGN KEY ("joins_cohort_id") REFERENCES "cohorts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "cohorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_home_room_id_fkey" FOREIGN KEY ("home_room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_groups" ADD CONSTRAINT "sub_groups_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_groups" ADD CONSTRAINT "sub_groups_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_sections" ADD CONSTRAINT "elective_sections_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_sections" ADD CONSTRAINT "elective_sections_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_sections" ADD CONSTRAINT "elective_sections_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_section_sources" ADD CONSTRAINT "elective_section_sources_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_section_sources" ADD CONSTRAINT "elective_section_sources_elective_section_id_fkey" FOREIGN KEY ("elective_section_id") REFERENCES "elective_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_section_sources" ADD CONSTRAINT "elective_section_sources_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_sub_group_id_fkey" FOREIGN KEY ("sub_group_id") REFERENCES "sub_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_electives" ADD CONSTRAINT "student_electives_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_electives" ADD CONSTRAINT "student_electives_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_electives" ADD CONSTRAINT "student_electives_elective_section_id_fkey" FOREIGN KEY ("elective_section_id") REFERENCES "elective_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty" ADD CONSTRAINT "faculty_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty" ADD CONSTRAINT "faculty_home_department_id_fkey" FOREIGN KEY ("home_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty" ADD CONSTRAINT "faculty_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_departments" ADD CONSTRAINT "faculty_departments_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_departments" ADD CONSTRAINT "faculty_departments_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_departments" ADD CONSTRAINT "faculty_departments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_unavailability" ADD CONSTRAINT "faculty_unavailability_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_unavailability" ADD CONSTRAINT "faculty_unavailability_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_owner_department_id_fkey" FOREIGN KEY ("owner_department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_sub_group_id_fkey" FOREIGN KEY ("sub_group_id") REFERENCES "sub_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_elective_section_id_fkey" FOREIGN KEY ("elective_section_id") REFERENCES "elective_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_preferred_room_id_fkey" FOREIGN KEY ("preferred_room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignment_faculty" ADD CONSTRAINT "teaching_assignment_faculty_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignment_faculty" ADD CONSTRAINT "teaching_assignment_faculty_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "teaching_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignment_faculty" ADD CONSTRAINT "teaching_assignment_faculty_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_mentors" ADD CONSTRAINT "subject_mentors_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_mentors" ADD CONSTRAINT "subject_mentors_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_mentors" ADD CONSTRAINT "subject_mentors_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_mentors" ADD CONSTRAINT "subject_mentors_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "cohorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_mentors" ADD CONSTRAINT "subject_mentors_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_scopes" ADD CONSTRAINT "timetable_scopes_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_scopes" ADD CONSTRAINT "timetable_scopes_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_scopes" ADD CONSTRAINT "timetable_scopes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_scope_cohorts" ADD CONSTRAINT "timetable_scope_cohorts_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_scope_cohorts" ADD CONSTRAINT "timetable_scope_cohorts_scope_id_fkey" FOREIGN KEY ("scope_id") REFERENCES "timetable_scopes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_scope_cohorts" ADD CONSTRAINT "timetable_scope_cohorts_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "cohorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

