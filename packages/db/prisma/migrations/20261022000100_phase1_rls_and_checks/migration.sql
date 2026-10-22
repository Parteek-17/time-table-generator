-- Phase 1: row-level security and integrity rules for the master-data tables.
-- See docs/adr/0002-tenancy-and-rls.md and docs/adr/0007-phase1-data-model.md.

-- 1. Row-level security ------------------------------------------------------
-- Same policy as Phase 0's departments/invites: rows are visible and writable only for
-- the institute set by withTenant(). Grants come from the default privileges set in
-- *_row_level_security.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'programmes', 'branches', 'scheme_versions', 'courses', 'course_branches',
    'academic_sessions', 'terms', 'term_cohort_windows', 'calendar_windows', 'holidays',
    'extra_working_days', 'bell_schedules', 'bell_periods', 'bell_breaks',
    'bell_schedule_programmes', 'fixed_slots', 'fixed_slot_faculty', 'batches', 'cohorts',
    'sections', 'sub_groups', 'elective_sections', 'elective_section_sources', 'students',
    'student_electives', 'faculty', 'faculty_departments', 'faculty_unavailability',
    'buildings', 'rooms', 'teaching_assignments', 'teaching_assignment_faculty',
    'subject_mentors', 'timetable_scopes', 'timetable_scope_cohorts', 'import_jobs',
    'import_rows'
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

-- 2. One-per-institute rules ---------------------------------------------------
-- At most one active term.
CREATE UNIQUE INDEX terms_one_active
  ON "terms" (institute_id) WHERE status = 'active' AND deleted_at IS NULL;
-- At most one default bell schedule.
CREATE UNIQUE INDEX bell_schedules_one_default
  ON "bell_schedules" (institute_id) WHERE is_default AND deleted_at IS NULL;
-- At most one default branch per programme.
CREATE UNIQUE INDEX branches_one_default
  ON "branches" (programme_id) WHERE is_default AND deleted_at IS NULL;

-- 3. Scoped rows: scope_type names exactly the one FK column that is set --------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['calendar_windows', 'holidays', 'extra_working_days', 'fixed_slots']
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I CHECK (
         (scope_type = ''institute''  AND num_nonnulls(department_id, programme_id, cohort_id, section_id) = 0) OR
         (scope_type = ''department'' AND department_id IS NOT NULL AND num_nonnulls(programme_id, cohort_id, section_id) = 0) OR
         (scope_type = ''programme''  AND programme_id  IS NOT NULL AND num_nonnulls(department_id, cohort_id, section_id) = 0) OR
         (scope_type = ''cohort''     AND cohort_id     IS NOT NULL AND num_nonnulls(department_id, programme_id, section_id) = 0) OR
         (scope_type = ''section''    AND section_id    IS NOT NULL AND num_nonnulls(department_id, programme_id, cohort_id) = 0)
       )',
      t, t || '_scope_check'
    );
  END LOOP;
END
$$;

-- 4. Teaching assignments: the target column matches `target` --------------------
ALTER TABLE "teaching_assignments" ADD CONSTRAINT teaching_assignments_target_check CHECK (
  (target = 'section'          AND section_id IS NOT NULL AND sub_group_id IS NULL AND elective_section_id IS NULL) OR
  (target = 'subgroup'         AND sub_group_id IS NOT NULL AND section_id IS NULL AND elective_section_id IS NULL) OR
  (target = 'elective_section' AND elective_section_id IS NOT NULL AND section_id IS NULL AND sub_group_id IS NULL)
);
-- One live assignment per (term, course, component, target).
CREATE UNIQUE INDEX teaching_assignments_unique_section
  ON "teaching_assignments" (term_id, course_id, component, section_id)
  WHERE section_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX teaching_assignments_unique_sub_group
  ON "teaching_assignments" (term_id, course_id, component, sub_group_id)
  WHERE sub_group_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX teaching_assignments_unique_elective_section
  ON "teaching_assignments" (term_id, course_id, component, elective_section_id)
  WHERE elective_section_id IS NOT NULL AND deleted_at IS NULL;

-- 5. Value checks (the API validates first with zod; these are the safety net) ----
ALTER TABLE "programmes" ADD CONSTRAINT programmes_semesters_check
  CHECK (total_semesters BETWEEN 1 AND 12
         AND (lateral_entry_semester IS NULL
              OR lateral_entry_semester BETWEEN 2 AND total_semesters));

ALTER TABLE "courses" ADD CONSTRAINT courses_values_check
  CHECK (semester BETWEEN 1 AND 12
         AND lectures >= 0 AND tutorials >= 0 AND practicals >= 0
         AND lab_block_length BETWEEN 1 AND 4
         AND (credits_override IS NULL OR credits_override >= 0)
         AND (syllabus_hours IS NULL OR syllabus_hours >= 0));

ALTER TABLE "academic_sessions" ADD CONSTRAINT academic_sessions_year_check
  CHECK (start_year BETWEEN 2000 AND 2100);

ALTER TABLE "terms" ADD CONSTRAINT terms_dates_check
  CHECK (end_date >= start_date AND min_teaching_days >= 0);

ALTER TABLE "term_cohort_windows" ADD CONSTRAINT term_cohort_windows_dates_check
  CHECK ((prep_holidays_start IS NULL OR prep_holidays_start >= teaching_start)
         AND (prep_holidays_end IS NULL OR prep_holidays_start IS NULL OR prep_holidays_end >= prep_holidays_start)
         AND (end_sem_exam_start IS NULL OR end_sem_exam_start >= teaching_start));

ALTER TABLE "calendar_windows" ADD CONSTRAINT calendar_windows_dates_check
  CHECK (end_date >= start_date);
ALTER TABLE "holidays" ADD CONSTRAINT holidays_dates_check
  CHECK (end_date >= start_date);
ALTER TABLE "extra_working_days" ADD CONSTRAINT extra_working_days_weekday_check
  CHECK (follows_weekday BETWEEN 1 AND 7);

ALTER TABLE "bell_schedules" ADD CONSTRAINT bell_schedules_days_check
  CHECK (cardinality(working_days) BETWEEN 1 AND 7 AND working_days <@ ARRAY[1,2,3,4,5,6,7]);
ALTER TABLE "bell_periods" ADD CONSTRAINT bell_periods_times_check
  CHECK (index >= 1 AND start_minute >= 0 AND end_minute <= 1440 AND end_minute > start_minute);
ALTER TABLE "bell_breaks" ADD CONSTRAINT bell_breaks_values_check
  CHECK (after_period_index >= 1 AND minutes > 0);

ALTER TABLE "fixed_slots" ADD CONSTRAINT fixed_slots_values_check
  CHECK (weekday BETWEEN 1 AND 7 AND start_period_index >= 1
         AND end_period_index >= start_period_index);

ALTER TABLE "batches" ADD CONSTRAINT batches_year_check
  CHECK (admission_year BETWEEN 2000 AND 2100);
ALTER TABLE "cohorts" ADD CONSTRAINT cohorts_values_check
  CHECK (semester BETWEEN 1 AND 12 AND (joins_cohort_id IS NULL OR joins_cohort_id <> id));
ALTER TABLE "sections" ADD CONSTRAINT sections_strength_check CHECK (strength >= 0);
ALTER TABLE "sub_groups" ADD CONSTRAINT sub_groups_strength_check CHECK (strength >= 0);
ALTER TABLE "elective_sections" ADD CONSTRAINT elective_sections_strength_check CHECK (strength >= 0);

ALTER TABLE "faculty" ADD CONSTRAINT faculty_load_check
  CHECK (max_periods_per_day BETWEEN 0 AND 16 AND max_periods_per_week BETWEEN 0 AND 80);
ALTER TABLE "faculty_unavailability" ADD CONSTRAINT faculty_unavailability_values_check
  CHECK (weekday BETWEEN 1 AND 7 AND period_index >= 1);

ALTER TABLE "buildings" ADD CONSTRAINT buildings_floors_check CHECK (floors >= 1);
ALTER TABLE "rooms" ADD CONSTRAINT rooms_values_check
  CHECK ((rows IS NULL OR rows >= 0) AND (seats_per_row IS NULL OR seats_per_row >= 0)
         AND (capacity_override IS NULL OR capacity_override >= 0)
         AND (exam_seats_per_bench IS NULL OR exam_seats_per_bench >= 0));

ALTER TABLE "import_jobs" ADD CONSTRAINT import_jobs_progress_check
  CHECK (progress BETWEEN 0 AND 100 AND row_count >= 0);
ALTER TABLE "import_rows" ADD CONSTRAINT import_rows_action_check
  CHECK (action IN ('create', 'update', 'skip'));
