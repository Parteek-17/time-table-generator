# Phase 1 plan: Institute setup

Status: **accepted 2026-10-22** with the recommended defaults for all open questions.
Progress: 1a done (schema, migrations, seed, shared functions); 1b done (CRUD API and
screens, ADR 0009). Decisions are recorded in
ADR 0007 (data model) and ADR 0008 (permissions).

Changes made while building 1a:

- `bell.manage` became part of `calendar.manage`; `setup.view` is called `masterdata.view`.
- Lateral entry (question 1): the joining cohort has no sections, and its students are counted
  in the regular sections' strength (`Cohort.joinsCohortId`), so no separate "joining strength".
- The sample institute has 44 faculty, about what its weekly load (~550 periods) needs.
- Cohort codes: "CSE S3" for undergraduate branches, "MBA S1" without branches,
  "MTECH CSE S1" for postgraduate branches.

Sections: [1. Conventions](#1-conventions-carried-over-from-phase-0) ·
[2. Schema diff](#2-prisma-schema-diff) · [3. Permissions](#3-permissions-can) ·
[4. Screens](#4-screens) · [5. API modules](#5-api-modules) ·
[6. Shared pure functions](#6-pure-functions-in-packagesshared) ·
[7. Milestones](#7-milestones) · [8. Open questions](#8-open-questions)

---

## 1. Conventions carried over from Phase 0

The brief says "adjust names to match Phase 0 conventions". Concretely:

| Brief says                       | Phase 0 convention used                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `archivedAt`                     | `deletedAt` / `deleted_at` (already on `Department`, `Institute`). The UI says **Archive**, never "delete".          |
| Enum values `TEACHING`, `ODD`, … | lower-case snake values, `@@map`ped enum names (`teaching`, `odd`, `full_time`), as `InstituteType`/`Role` do today. |
| camelCase fields                 | camelCase in Prisma, `@map` to snake_case columns, `@@map` to plural snake tables.                                   |
| —                                | uuid ids, `createdAt`/`updatedAt`, `instituteId` + `@@index([instituteId])` on every tenant table.                   |

Decisions forced by RLS (will be ADR 0007):

1. **No implicit many-to-many.** Prisma's implicit join tables (`_A_B`) cannot carry `institute_id`, so
   they would escape RLS. Every many-to-many is an explicit model with `instituteId`.
2. **Every new tenant table gets the same `tenant_isolation` policy** in the migration and a line in
   `packages/db/test/rls.test.ts` (ADR 0002 already requires this). The test will loop over every
   tenant table instead of listing them by hand, and fail if a table with `institute_id` has no policy.
3. **Cross-tenant references.** Postgres FK checks bypass RLS, so an API bug could link institute A's
   section to institute B's room id. Services resolve every referenced id inside the tenant
   transaction first (RLS hides foreign rows, so the lookup 404s). A helper
   `requireInTenant(tx, model, id)` keeps this to one line per reference; an e2e test tries it.
   (Composite `(institute_id, id)` FKs were considered; Prisma handles them badly for optional
   relations.)
4. **Polymorphic scopes** (holiday, calendar window, fixed slot) are one `scopeType` enum plus
   nullable FK columns (`departmentId`, `programmeId`, `cohortId`, `sectionId`) and a SQL `CHECK`
   that exactly the matching column is set. Real FKs, no free-text ids.
5. **Times** are minutes from midnight (`Int`), dates are `@db.Date`, days of week are ISO ints
   (1 = Mon … 7 = Sun), as CLAUDE.md asks.

Small deviations from the brief, for your OK:

- `Course.branch` (nullable) becomes a **list** `CourseBranch` (empty = common to all branches), so
  one course can be offered to CSE and ECE but not ME without duplicating its code.
- `ElectiveSection` stores the **regular sections it draws from** (`ElectiveSectionSource`), not
  just cohorts. Phase 2 needs this to know which sections are busy during an elective slot. Cohorts
  are derived from those sections.
- `Programme.department` is **optional**: B.Tech spans CSE/ECE/ME and is owned by the institute;
  its branches carry the department.
- One extra model, `ExtraWorkingDay` (e.g. "Sat 2026-09-12 runs Monday's timetable"), so the
  readiness check's "suggest working Saturdays" has something to create.
- `BellSchedule` stores periods and breaks as child rows; the period times are the source of
  truth and breaks are validated against the gaps (shared function), so the two never disagree.

---

## 2. Prisma schema diff

### 2.1 Changes to existing models

```diff
 model Institute {
   ...
   timezone           String        @default("Asia/Kolkata")
   parentUniversityId String?       @map("parent_university_id") @db.Uuid
+  /// Free text when the affiliating university is not itself on Slotwise.
+  affiliatingUniversityName String? @map("affiliating_university_name")
+  /// Object-storage key of the logo (see ADR 0009).
+  logoKey            String?       @map("logo_key")
+  /// Wizard progress: { completed: StepId[], skipped: StepId[], current: StepId }.
+  setupState         Json          @default("{}") @map("setup_state")
+  /// Created by "Try with sample data". Hidden from platform lists, can be thrown away.
+  isSample           Boolean       @default(false) @map("is_sample")
   ...
+  // + back-relations for every new tenant model
 }

+enum DepartmentKind {
+  teaching
+  service
+  @@map("department_kind")
+}

 model Department {
   ...
   code        String
+  kind        DepartmentKind @default(teaching)
   ...
 }
```

`Membership` and `Invite` are unchanged. `scope_type = 'section'` now points at `sections.id`
(see question 5 about sections being per term).

### 2.2 New enums

```prisma
enum ProgrammeLevel     { ug pg diploma doctoral                        @@map("programme_level") }
enum StudyMode          { full_time part_time                           @@map("study_mode") }
enum SchemeStatus       { draft active retired                          @@map("scheme_status") }
enum CourseType         { core programme_elective open_elective mandatory audit lab project seminar training mooc  @@map("course_type") }
enum GroupedBy          { section subgroup                              @@map("grouped_by") }
enum TermKind           { odd even                                      @@map("term_kind") }
enum TermStatus         { planning active closed                        @@map("term_status") }
enum EntryType          { regular lateral                               @@map("entry_type") }
enum BatchStatus        { active graduated discontinued                 @@map("batch_status") }
enum CalendarWindowType { mid_sem_exam orientation vacation training other  @@map("calendar_window_type") }
enum CalendarScope      { institute department programme cohort section @@map("calendar_scope") }
enum FixedSlotKind      { mentoring minor_degree honours remedial library sports_ncc other  @@map("fixed_slot_kind") }
enum StudentStatus      { active detained left                          @@map("student_status") }
enum Designation        { professor associate_professor assistant_professor lecturer teaching_assistant visiting  @@map("designation") }
enum Experience         { experienced fresher                           @@map("experience") }
enum RoomType           { lecture tutorial lab seminar drawing_hall workshop  @@map("room_type") }
enum Component          { lecture tutorial practical                    @@map("component") }   // L, T, P
enum AssignmentTarget   { section subgroup elective_section             @@map("assignment_target") }
enum TeacherRole        { main co_teacher ta                            @@map("teacher_role") }
enum ImportKind         { departments programmes batches_sections students faculty rooms courses holidays teaching_assignments fet  @@map("import_kind") }
enum ImportStatus       { uploaded parsing mapping preview committing committed failed cancelled  @@map("import_status") }
```

(Shown one per line for reading; the real file uses the normal multi-line enum syntax.)

### 2.3 New models

Every model below also has, unless noted:

```prisma
  id          String    @id @default(uuid()) @db.Uuid
  instituteId String    @map("institute_id") @db.Uuid
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")        // master data only, see notes
  institute   Institute @relation(fields: [instituteId], references: [id])
  @@index([instituteId])
```

They are omitted below to keep the diff readable. Join tables and child rows (periods, breaks,
unavailability, assignment faculty) have no `deletedAt`; they are replaced with their parent.

#### Organisation

```prisma
model Programme {
  code                 String          // BTECH, MTECH, MBA
  name                 String          // B.Tech
  level                ProgrammeLevel
  mode                 StudyMode       @default(full_time)
  totalSemesters       Int             @map("total_semesters")          // CHECK 1..12
  lateralEntrySemester Int?            @map("lateral_entry_semester")   // CHECK < totalSemesters
  departmentId         String?         @map("department_id") @db.Uuid   // null = institute-owned
  branches       Branch[]
  schemeVersions SchemeVersion[]
  @@unique([instituteId, code])
  @@map("programmes")
}

model Branch {
  programmeId  String  @map("programme_id") @db.Uuid
  code         String  // CSE; "GEN" for the default branch
  name         String
  departmentId String  @map("department_id") @db.Uuid
  isDefault    Boolean @default(false) @map("is_default")   // programmes without branches
  @@unique([programmeId, code])
  @@map("branches")
}
```

#### Academic structure

```prisma
model SchemeVersion {
  programmeId String       @map("programme_id") @db.Uuid
  name        String       // Study Scheme 2024
  status      SchemeStatus @default(draft)
  courses Course[]
  batches Batch[]
  @@unique([programmeId, name])
  @@map("scheme_versions")
}

model Course {
  schemeVersionId      String     @map("scheme_version_id") @db.Uuid
  semester             Int        // CHECK 1..programme.totalSemesters (service check)
  code                 String     // CS301
  title                String
  shortName            String     @map("short_name")         // DS, OOP
  lectures             Int        @default(0)                // L periods/week
  tutorials            Int        @default(0)                // T
  practicals           Int        @default(0)                // P
  /// Null = L + T + P/2 (computed in packages/shared). Set only to override.
  creditsOverride      Decimal?   @map("credits_override") @db.Decimal(4, 1)
  syllabusHours        Int?       @map("syllabus_hours")
  type                 CourseType @default(core)
  electiveGroup        String?    @map("elective_group")     // Elective-IV
  offeringDepartmentId String     @map("offering_department_id") @db.Uuid
  roomType             RoomType?  @map("room_type")          // null = lecture for L/T, lab for P
  labCategory          String?    @map("lab_category")       // "Software lab"
  labBlockLength       Int        @default(2) @map("lab_block_length")
  isScheduled          Boolean    @default(true) @map("is_scheduled")   // false: MOOC, training, project-only
  tutorialBy           GroupedBy  @default(subgroup) @map("tutorial_by")
  practicalBy          GroupedBy  @default(subgroup) @map("practical_by")
  branches CourseBranch[]          // empty = common to all branches of the programme
  @@unique([schemeVersionId, code])
  @@index([schemeVersionId, semester])
  @@map("courses")
}

model CourseBranch {                // join, no deletedAt
  courseId String @map("course_id") @db.Uuid
  branchId String @map("branch_id") @db.Uuid
  @@unique([courseId, branchId])
  @@map("course_branches")
}
```

#### Time

```prisma
model AcademicSession {
  name      String   // 2026-27
  startYear Int      @map("start_year")   // 2026; drives semester derivation
  terms Term[]
  @@unique([instituteId, startYear])
  @@map("academic_sessions")
}

model Term {
  sessionId       String     @map("session_id") @db.Uuid
  kind            TermKind
  label           String     // July–Dec 2026
  startDate       DateTime   @map("start_date") @db.Date
  endDate         DateTime   @map("end_date") @db.Date
  minTeachingDays Int        @default(90) @map("min_teaching_days")
  status          TermStatus @default(planning)
  @@unique([sessionId, kind])
  @@map("terms")
}
// SQL: CREATE UNIQUE INDEX terms_one_active ON terms (institute_id) WHERE status = 'active' AND deleted_at IS NULL;

model TermCohortWindow {
  termId              String     @map("term_id") @db.Uuid
  programmeId         String     @map("programme_id") @db.Uuid
  semesters           Int[]      @default([])      // empty = every semester of the programme
  entryType           EntryType? @map("entry_type") // null = both
  teachingStart       DateTime   @map("teaching_start") @db.Date
  prepHolidaysStart   DateTime?  @map("prep_holidays_start") @db.Date
  prepHolidaysEnd     DateTime?  @map("prep_holidays_end") @db.Date
  endSemExamStart     DateTime?  @map("end_sem_exam_start") @db.Date
  @@index([termId])
  @@map("term_cohort_windows")
}

model CalendarWindow {
  termId    String             @map("term_id") @db.Uuid
  type      CalendarWindowType
  label     String
  startDate DateTime           @map("start_date") @db.Date
  endDate   DateTime           @map("end_date") @db.Date
  // scope: scopeType + exactly one of the FK columns below (CHECK constraint)
  scopeType    CalendarScope   @default(institute) @map("scope_type")
  departmentId String?         @map("department_id") @db.Uuid
  programmeId  String?         @map("programme_id") @db.Uuid
  cohortId     String?         @map("cohort_id") @db.Uuid
  sectionId    String?         @map("section_id") @db.Uuid
  @@map("calendar_windows")
}

model Holiday {
  startDate DateTime @map("start_date") @db.Date
  endDate   DateTime @map("end_date") @db.Date     // = startDate for one day
  name      String
  + same scope columns as CalendarWindow
  @@index([instituteId, startDate])
  @@map("holidays")
}

model ExtraWorkingDay {             // "Sat 12 Sep runs Monday's timetable"
  termId          String   @map("term_id") @db.Uuid
  date            DateTime @db.Date
  followsWeekday  Int      @map("follows_weekday")   // 1..7
  + same scope columns
  @@map("extra_working_days")
}

model BellSchedule {
  name        String
  workingDays Int[]   @map("working_days")   // ISO weekdays, e.g. [1,2,3,4,5]
  isDefault   Boolean @default(false) @map("is_default")
  periods BellPeriod[]
  breaks  BellBreak[]
  programmes BellScheduleProgramme[]         // overrides: these programmes use this schedule
  @@map("bell_schedules")
}
// SQL: one default per institute (partial unique index on is_default).

model BellPeriod {                  // child, no deletedAt
  bellScheduleId String @map("bell_schedule_id") @db.Uuid
  index          Int    // 1-based, P1..Pn
  label          String // P1
  startMinute    Int    @map("start_minute")
  endMinute      Int    @map("end_minute")
  @@unique([bellScheduleId, index])
  @@map("bell_periods")
}

model BellBreak {                   // child
  bellScheduleId   String @map("bell_schedule_id") @db.Uuid
  label            String // Lunch
  afterPeriodIndex Int    @map("after_period_index")
  minutes          Int
  @@unique([bellScheduleId, afterPeriodIndex])
  @@map("bell_breaks")
}

model BellScheduleProgramme {       // join
  bellScheduleId String @map("bell_schedule_id") @db.Uuid
  programmeId    String @map("programme_id") @db.Uuid
  semesters      Int[]  @default([])            // e.g. first year only
  @@unique([bellScheduleId, programmeId])
  @@map("bell_schedule_programmes")
}

model FixedSlot {
  termId           String        @map("term_id") @db.Uuid
  kind             FixedSlotKind
  label            String        // Mentoring (MC)
  weekday          Int           // 1..7
  startPeriodIndex Int           @map("start_period_index")
  endPeriodIndex   Int           @map("end_period_index")   // inclusive
  + same scope columns (institute | department | programme | cohort | section)
  faculty FixedSlotFaculty[]
  @@map("fixed_slots")
}

model FixedSlotFaculty {            // join
  fixedSlotId String @map("fixed_slot_id") @db.Uuid
  facultyId   String @map("faculty_id") @db.Uuid
  @@unique([fixedSlotId, facultyId])
  @@map("fixed_slot_faculty")
}
```

#### People and groups

```prisma
model Batch {
  programmeId     String      @map("programme_id") @db.Uuid
  branchId        String      @map("branch_id") @db.Uuid
  admissionYear   Int         @map("admission_year")
  entryType       EntryType   @default(regular) @map("entry_type")
  schemeVersionId String      @map("scheme_version_id") @db.Uuid
  status          BatchStatus @default(active)
  cohorts  Cohort[]
  students Student[]
  @@unique([branchId, admissionYear, entryType])
  @@map("batches")
}

model Cohort {                      // a batch in a term
  batchId             String  @map("batch_id") @db.Uuid
  termId              String  @map("term_id") @db.Uuid
  semester            Int     // derived (packages/shared), stored so it can be overridden
  semesterOverridden  Boolean @default(false) @map("semester_overridden")
  isRunning           Boolean @default(true) @map("is_running")   // false: training/internship semester
  displayCode         String  @map("display_code")                // D2 CSE
  sections Section[]
  @@unique([batchId, termId])
  @@map("cohorts")
}

model Section {
  cohortId    String  @map("cohort_id") @db.Uuid
  name        String  // A
  displayName String  @map("display_name")   // CS A
  strength    Int
  homeRoomId  String? @map("home_room_id") @db.Uuid
  subGroups SubGroup[]
  @@unique([cohortId, name])
  @@map("sections")
}

model SubGroup {
  sectionId String @map("section_id") @db.Uuid
  name      String // A1
  strength  Int
  @@unique([sectionId, name])
  @@map("sub_groups")
}

model ElectiveSection {
  termId   String @map("term_id") @db.Uuid
  courseId String @map("course_id") @db.Uuid
  name     String // DS-E4-1
  strength Int
  sources  ElectiveSectionSource[]   // regular sections it draws students from (may span branches)
  @@unique([termId, courseId, name])
  @@map("elective_sections")
}

model ElectiveSectionSource {       // join
  electiveSectionId String @map("elective_section_id") @db.Uuid
  sectionId         String @map("section_id") @db.Uuid
  @@unique([electiveSectionId, sectionId])
  @@map("elective_section_sources")
}

model Student {                     // optional in Phase 1
  batchId          String        @map("batch_id") @db.Uuid
  classRollNo      String        @map("class_roll_no")
  universityRollNo String?       @map("university_roll_no")
  name             String
  email            String?
  phone            String?
  sectionId        String?       @map("section_id") @db.Uuid     // current term
  subGroupId       String?       @map("sub_group_id") @db.Uuid
  status           StudentStatus @default(active)
  electives StudentElective[]
  @@unique([instituteId, classRollNo])
  @@map("students")
}

model StudentElective {             // join
  studentId         String @map("student_id") @db.Uuid
  electiveSectionId String @map("elective_section_id") @db.Uuid
  @@unique([studentId, electiveSectionId])
  @@map("student_electives")
}

model Faculty {
  employeeCode      String      @map("employee_code")
  name              String
  shortCode         String      @map("short_code")      // VT
  email             String?
  designation       Designation
  experience        Experience
  homeDepartmentId  String      @map("home_department_id") @db.Uuid
  maxPeriodsPerDay  Int         @map("max_periods_per_day")    // filled from defaults on create
  maxPeriodsPerWeek Int         @map("max_periods_per_week")   // experienced 14, fresher 18
  userId            String?     @unique @map("user_id") @db.Uuid   // linked login (global users table)
  departments    FacultyDepartment[]     // additional departments they teach in
  unavailability FacultyUnavailability[]
  @@unique([instituteId, employeeCode])
  @@unique([instituteId, shortCode])
  @@map("faculty")
}

model FacultyDepartment {           // join
  facultyId    String @map("faculty_id") @db.Uuid
  departmentId String @map("department_id") @db.Uuid
  @@unique([facultyId, departmentId])
  @@map("faculty_departments")
}

model FacultyUnavailability {       // child: one row per blocked cell
  facultyId   String  @map("faculty_id") @db.Uuid
  weekday     Int
  periodIndex Int     @map("period_index")
  reason      String?
  @@unique([facultyId, weekday, periodIndex])
  @@map("faculty_unavailability")
}
```

#### Infrastructure

```prisma
model Building {
  name   String
  code   String?
  floors Int    @default(1)
  rooms Room[]
  @@unique([instituteId, name])
  @@map("buildings")
}

model Room {
  code              String    // G16, S214, SL-IV LAB
  buildingId        String    @map("building_id") @db.Uuid
  floor             Int       @default(0)              // 0 = ground
  type              RoomType
  labCategories     String[]  @default([]) @map("lab_categories")
  rows              Int?
  seatsPerRow       Int?      @map("seats_per_row")
  /// Null = rows × seatsPerRow.
  capacityOverride  Int?      @map("capacity_override")
  examSeatsPerBench Int?      @map("exam_seats_per_bench")
  ownerDepartmentId String?   @map("owner_department_id") @db.Uuid
  isShared          Boolean   @default(true) @map("is_shared")
  isAccessible      Boolean   @default(false) @map("is_accessible")   // ground floor or lift
  @@unique([instituteId, code])
  @@map("rooms")
}
```

#### Who teaches what

```prisma
model TeachingAssignment {          // the department's "subject distribution"
  termId               String           @map("term_id") @db.Uuid
  courseId             String           @map("course_id") @db.Uuid
  component            Component
  target               AssignmentTarget
  sectionId            String?          @map("section_id") @db.Uuid
  subGroupId           String?          @map("sub_group_id") @db.Uuid
  electiveSectionId    String?          @map("elective_section_id") @db.Uuid
  preferredRoomId      String?          @map("preferred_room_id") @db.Uuid
  preferredLabCategory String?          @map("preferred_lab_category")
  faculty TeachingAssignmentFaculty[]
  @@index([termId, courseId])
  @@map("teaching_assignments")
}
// SQL: CHECK exactly the column matching `target` is set;
//      partial unique (term_id, course_id, component, <target column>) WHERE deleted_at IS NULL.

model TeachingAssignmentFaculty {   // join
  assignmentId String      @map("assignment_id") @db.Uuid
  facultyId    String      @map("faculty_id") @db.Uuid
  role         TeacherRole @default(main)
  @@unique([assignmentId, facultyId])
  @@map("teaching_assignment_faculty")
}

model SubjectMentor {
  termId    String @map("term_id") @db.Uuid
  courseId  String @map("course_id") @db.Uuid
  cohortId  String @map("cohort_id") @db.Uuid
  facultyId String @map("faculty_id") @db.Uuid
  @@unique([termId, courseId, cohortId])
  @@map("subject_mentors")
}
```

#### Planning and imports

```prisma
model TimetableScope {              // saved in Phase 1, used by the Phase 2 solver
  termId      String  @map("term_id") @db.Uuid
  name        String  @default("Main")
  notes       String?
  createdById String  @map("created_by_id") @db.Uuid
  cohorts TimetableScopeCohort[]
  @@map("timetable_scopes")
}

model TimetableScopeCohort {        // join
  scopeId  String @map("scope_id") @db.Uuid
  cohortId String @map("cohort_id") @db.Uuid
  @@unique([scopeId, cohortId])
  @@map("timetable_scope_cohorts")
}

model ImportJob {                   // no deletedAt
  kind          ImportKind
  status        ImportStatus @default(uploaded)
  fileName      String       @map("file_name")
  fileKey       String       @map("file_key")          // object storage
  termId        String?      @map("term_id") @db.Uuid  // for term-bound kinds
  columnMapping Json         @default("{}") @map("column_mapping")
  rowCount      Int          @default(0) @map("row_count")
  progress      Int          @default(0)               // 0..100
  summary       Json         @default("{}")            // { created, updated, skipped }
  createdById   String       @map("created_by_id") @db.Uuid
  rows ImportRow[]
  @@map("import_jobs")
}

model ImportRow {                   // parsed rows for preview and inline fixes
  jobId     String  @map("job_id") @db.Uuid
  rowNumber Int     @map("row_number")
  data      Json                     // after column mapping and edits
  errors    Json    @default("[]")   // [{ column, message }] in plain words
  /// create | update | skip, decided at preview by natural key.
  action    String
  @@unique([jobId, rowNumber])
  @@map("import_rows")
}
```

**Audit log:** unchanged table. `AuditAction` becomes `` `${Entity}.${'created'|'updated'|'archived'|'restored'}` ``
plus `import.committed`, `batches.promoted`, `sample.loaded`; `metadata` holds the changed fields
(`{ before, after }`, only the fields that changed). All writes go through one
`MasterDataService` helper that does lookup-in-tenant, `can()`, write and audit in one transaction,
so a write without an audit entry is hard to write by accident. An e2e test walks every write
endpoint and asserts one audit row each.

---

## 3. Permissions (`can()`)

New actions (added to `ACTIONS`, `ROLE_PERMISSIONS`):

| Action                                                                                                         | institute_admin | hod (own dept)                                | timetable_coordinator (own scope) | faculty             | others                        |
| -------------------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------- | --------------------------------- | ------------------- | ----------------------------- |
| `setup.view` / `masterdata.view` (all Phase 1 reads)                                                           | ✓               | ✓ institute-wide                              | ✓ institute-wide                  | ✓ institute-wide    | exam_coordinator ✓; student ✗ |
| `institute.manage` (profile, wizard), `term.manage`, `calendar.manage`, `bell.manage`, `infrastructure.manage` | ✓               | –                                             | –                                 | –                   | –                             |
| `academics.manage` (programmes, branches, schemes, courses)                                                    | ✓               | ✓ if resource dept = theirs                   | –                                 | –                   | –                             |
| `cohort.manage` (batches, cohorts, sections, sub-groups, elective sections, students)                          | ✓               | ✓                                             | –                                 | –                   | –                             |
| `faculty.manage`                                                                                               | ✓               | ✓ home dept                                   | –                                 | –                   | –                             |
| `faculty.availability.edit`                                                                                    | ✓               | ✓ home dept                                   | –                                 | **own record only** | –                             |
| `teaching.manage` (assignments, subject mentors)                                                               | ✓               | ✓ see rule below                              | ✓                                 | –                   | –                             |
| `fixed_slot.manage`, `timetable_scope.manage`                                                                  | ✓               | –                                             | ✓                                 | –                   | –                             |
| `import.run`                                                                                                   | ✓               | ✓ (each row re-checked with the action above) | teaching assignments only         | –                   | –                             |
| `readiness.view`                                                                                               | ✓               | ✓                                             | ✓                                 | –                   | –                             |

`Resource` gains three optional fields; `can()` stays pure:

```ts
interface Resource {
  ...
  /** Department that owns the thing (branch dept for batches/sections, home dept for faculty). */
  departmentId?: string | null;
  /** Teaching assignment: home departments of every faculty on it. */
  facultyDepartmentIds?: readonly string[];
  /** Faculty availability: the User linked to that faculty record. */
  ownerUserId?: string | null;
}
```

- **Department of a resource:** batch/cohort/section/sub-group → branch's department; course →
  its branches' department (common course → programme's department, else institute admin only);
  faculty → home department; room → none (admin only).
- **Teaching assignment rule** (question 2): a hod may edit it if the _cohort's_ department is
  theirs (any faculty), **or** every faculty on it has their department as home department
  (service-department hod). Same for a department-scoped coordinator.
- **Self actions:** `faculty.availability.edit` for the `faculty` role passes only when
  `resource.ownerUserId === user.id`. `grantAllows` gets the user passed in for this.
- Unit tests in `can.test.ts` for each row of the table, plus API e2e tests for the three
  acceptance cases (cross-department hod, service hod, faculty self-edit).

---

## 4. Screens

All screens: phone-first (usable at 400 px), keyboard navigable, i18n strings in
`messages/en.json`, plain words. Lists are cards on phones and TanStack tables from `md` up.
Every edit shows an **Undo** toast (archive → restore) instead of a confirm; only archiving master
data that other records use asks first, and says what uses it.

New shared UI (`packages/ui`): DataTable (TanStack), Dialog/Sheet, Combobox (searchable select),
Tabs, Toast with Undo, Progress, Stepper, Checkbox/Switch, TimeInput, GridToggle (tap-to-toggle
day × period grid).

**Navigation:** home → "Needs attention" (setup progress, readiness issue count) for admins;
a **Setup** menu with the pages below. A term picker in the header for term-bound pages.

| #   | Route                                             | Screen                                                                                                                                                                                                 | Who                       |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| 1   | `/setup` → `/setup/[step]`                        | **Wizard**, 12 steps (§5 of the brief), progress bar, Save & continue, Skip for now, resume where left off                                                                                             | admin                     |
| 2   | `/setup/sample`                                   | Try with sample data (creates the sample institute, shows progress, opens it)                                                                                                                          | admin                     |
| 3   | `/settings/institute`                             | Institute profile, logo                                                                                                                                                                                | admin                     |
| 4   | `/departments`                                    | Departments list + form (code, name, kind)                                                                                                                                                             | admin                     |
| 5   | `/programmes`, `/programmes/[id]`                 | Programmes (presets or custom) with branches inline                                                                                                                                                    | admin, hod                |
| 6   | `/schemes`, `/schemes/[id]`                       | Scheme versions; courses grouped by semester, tab per semester; course form in a sheet (L-T-P with live credits)                                                                                       | admin, hod                |
| 7   | `/terms`, `/terms/[id]`                           | Sessions & terms; cohort start-date windows; "which semesters run" preview; **Promote batches** (preview → commit) on a closed term                                                                    | admin                     |
| 8   | `/calendar`                                       | Per term: holidays (paste box: `2026-10-20, Dussehra` / ranges), calendar windows, extra working days; teaching-day count per cohort window                                                            | admin                     |
| 9   | `/bell-schedules`, `/bell-schedules/[id]`         | Bell schedule builder: start time, period length, count, breaks → generated periods, editable; working days; programme overrides                                                                       | admin                     |
| 10  | `/fixed-slots`                                    | Fixed slots: kind, day, periods, scope, faculty                                                                                                                                                        | admin, coordinator        |
| 11  | `/cohorts`                                        | Running cohorts of the term (batches behind them), semester, running toggle                                                                                                                            | admin, hod                |
| 12  | `/cohorts/[id]`                                   | Sections (count, strength, home room), sub-groups (split evenly, edit), elective sections                                                                                                              | admin, hod                |
| 13  | `/batches`                                        | Batches: programme, branch, admission year, entry type, scheme version                                                                                                                                 | admin, hod                |
| 14  | `/students`                                       | Students list, filters by batch/section; import                                                                                                                                                        | admin, hod                |
| 15  | `/faculty`, `/faculty/[id]`                       | Faculty list (filter dept, designation, load), bulk edit max/day & max/week; detail: profile, departments, **load across departments**, availability                                                   | admin, hod                |
| 16  | `/faculty/[id]/availability`, `/me/availability`  | Availability grid: tap to toggle, copy a day to other days                                                                                                                                             | admin, hod, faculty (own) |
| 17  | `/rooms` (+ buildings tab)                        | Buildings and rooms, filters by type/lab category/building                                                                                                                                             | admin                     |
| 18  | `/teaching` → `/teaching/[cohortId]`              | **Teaching assignment grid**: rows = course × L/T/P, columns = sections / sub-groups / elective sections; cell = faculty combobox with live load badge (`12/14`); co-teacher/TA; subject mentor column | admin, hod, coordinator   |
| 19  | `/readiness`                                      | "Ready to generate?": 7 check groups, green "Ready" or "N issues", each issue links to its fixing screen                                                                                               | admin, hod, coordinator   |
| 20  | `/timetable-scope`                                | Pick term, tick running cohorts to include, notes                                                                                                                                                      | admin, coordinator        |
| 21  | `/imports`, `/imports/new?kind=`, `/imports/[id]` | Template download; upload → map columns → preview with row errors, inline fix or skip → commit → summary                                                                                               | admin, hod                |
| 22  | `/audit`                                          | Read-only audit log with filters (who, what, when)                                                                                                                                                     | admin, hod (own dept)     |
| 23  | `/platform/institutes`                            | Create a blank institute + invite its first admin (question 3)                                                                                                                                         | platform_admin            |

On phones the teaching grid becomes one card per course, sections listed inside it.

---

## 5. API modules

NestJS modules as the brief lists: `institute`, `academics`, `cohorts`, `faculty`,
`infrastructure`, `calendar` (incl. bell schedules, fixed slots), `teaching` (incl. timetable
scope), `imports`, `readiness`, plus `setup` (wizard state, sample institute) and a small
`platform` module (question 3). Every route has a zod schema in `packages/shared/src/schemas/*`.
REST style matches Phase 0: `GET /programmes`, `POST /programmes`, `PATCH /programmes/:id`,
`POST /programmes/:id/archive`, `POST /programmes/:id/restore`, plus action routes
(`POST /terms/:id/promote/preview`, `POST /terms/:id/promote`, `GET /terms/:id/readiness`).

Infrastructure additions (ADR 0009):

- **Object storage:** MinIO in `docker-compose.yml` locally (S3 API), any S3-compatible bucket
  in production (R2/S3). Used for import uploads and the logo. `@aws-sdk/client-s3`.
- **Jobs:** BullMQ on the existing Redis, worker inside the API process for now: import parsing
  (> 1,000 rows), import commit, sample-institute load. Progress written to `ImportJob.progress`,
  polled by the page every 2 s.
- **Excel:** ExcelJS for templates and `.xlsx` parsing; CSV through ExcelJS's CSV reader.
  Fuzzy header matching is our own small function in `packages/shared` (normalise + synonyms +
  edit distance), unit tested.
- **E2E:** Playwright (new dev dependency, `apps/web/e2e`), signs in through Mailpit's API.

---

## 6. Pure functions in `packages/shared`

All with unit tests (Vitest), all used by both API and web:

- `semesterFor({ admissionYear, entryType, lateralEntrySemester, totalSemesters }, { sessionStartYear, kind })` → `number | null` (null = past final semester or not started)
- `runningSemesters(programme, term)` (wizard step 4 preview)
- `credits({ L, T, P, override })`, `weeklyPeriods(course, component)`
- `buildBellSchedule({ start, periodMinutes, count, breaks })`, `validateBellSchedule`
- `availablePeriods(bellSchedule, fixedSlotsForSection)` per section
- `teachingDays({ window, holidays, calendarWindows, extraWorkingDays, workingDays })`, `suggestWorkingSaturdays`
- `splitEvenly(strength, groups)`, `subGroupsAddUp(section)`
- `facultyLoad(assignments, courses)` per faculty across departments
- `readiness(snapshot)` → `{ ready, issues: Issue[] }` where each issue has `category`, `severity`
  (`error` | `warning`), plain-language `message` and a `fix` link target
- `promotePreview(cohorts, nextTerm)`
- `matchHeaders(headers, templateColumns)` (fuzzy import mapping)
- Domain constants: programme presets, default bell schedule, load defaults by experience.

---

## 7. Milestones

Each milestone ends with small conventional commits, green `pnpm lint && pnpm typecheck && pnpm test`,
and a short demo note to you.

**1a: Schema, migrations, seed, shared functions + tests**

- Prisma models above; migration incl. RLS policies, CHECKs and partial unique indexes.
- RLS test generalised to every tenant table.
- `can()` extension + tests for the permission table.
- Pure functions of §6 + tests (semester derivation: regular/lateral, odd/even, 10-semester B.Arch,
  batch past final semester).
- Sample-institute builder `buildSampleInstitute()` in `packages/db` used by `pnpm db:seed` (the
  "demo" institute) and later by "Try with sample data". Fictional names only.
- ADR 0007 (data model and tenancy rules), ADR 0008 (master-data permissions).

**1b: CRUD API + screens** for organisation, academic structure, people (batches, cohorts,
sections, sub-groups, elective sections, students, faculty + availability), infrastructure,
calendar (terms, windows, holidays, bell schedules). Audit on every write; promote batches.
New `packages/ui` components. E2E tests for the hod/service-hod/faculty permission cases.

**1c: Setup wizard + sample data.** `/setup` steps 1–10 and 12 (step 11 links to the grid once
1e lands), save & resume, skip, presets; "Try with sample data"; platform "create institute"
screen; admin home "Needs attention". Playwright: wizard happy path (manual entry).

**1d: Excel/CSV import with templates.** MinIO + BullMQ (ADR 0009), templates with "How to fill"
sheet for all 9 kinds, mapping → preview → inline fix → commit → summary, re-import updates by
natural key, background parse > 1,000 rows. Playwright: wizard happy path using the templates.

**1e: Teaching grid, fixed slots, readiness, timetable scope.** Grid with live load badges,
subject mentors, fixed slots screen, readiness page (7 checks), timetable scope. Acceptance:
sample data shows exactly the planned gaps (listed in the seed and asserted in a test).

**1f (optional): FET import.** `.fet` XML → same preview/commit flow, unmapped-items list.

Planned seed gaps (so "Loading sample data produces exactly the expected readiness issues" is
testable): ECE 3rd sem has no tutorial assignment for one course; one ME section's sub-groups
don't add up; one Applied Sciences faculty over the weekly max; MBA 1st sem has no sections yet;
no room for lab category "Drawing hall"; Jul–Dec teaching days fall below 90 for first year
(warning with working-Saturday suggestion). Final list fixed in 1a and asserted in a test.

---

## 8. Open questions

Each has my recommended default; I'll go with these unless you say otherwise.

1. **LEET students: own sections or merged?** In the 2nd year, LEET students usually sit in the
   regular sections. _Recommended:_ LEET batch keeps its own `Batch` (own start window, own
   counts), and a cohort can be marked **"joins the sections of"** the regular cohort, adding its
   strength to those sections; it then has no sections of its own. Alternative: separate sections.
2. **Cross-department teaching assignments.** _Recommended:_ the cohort's hod may assign any
   faculty; another department's hod (e.g. Applied Sciences) may create/edit assignments only
   when all faculty on it are from their department. Alternative: only the course's offering
   department's hod picks the teacher.
3. **How does a blank institute get created?** Phase 0 has no screen for it (seed only).
   _Recommended:_ a small platform-admin page "Create institute" (name, slug, type, first admin's
   email → invite). Self-serve sign-up stays out of scope.
4. **File storage for uploads and logo.** _Recommended:_ MinIO in docker-compose now, S3/R2 in
   production, as CLAUDE.md's stack says. Alternative: keep uploads in Postgres (`bytea`) until
   later; simpler but we would migrate it.
5. **Sections are per term.** Promotion copies sections into new rows, so a `section`-scoped
   membership (future class representative/student login) would point at last term's section.
   _Recommended:_ fine for Phase 1 (no section-scoped roles are issued yet); Phase 5 resolves
   students through `Student.sectionId` instead of section-scoped memberships.
6. **Max periods per day** isn't specified. _Recommended:_ experienced 4/day, fresher 5/day
   (with 14 and 18/week as given), all editable.
7. **Teaching days:** do mid-semester exam weeks and orientation count as teaching days?
   _Recommended:_ no (they are subtracted), vacation and preparatory holidays too.
8. **"Ready" with warnings:** _Recommended:_ errors (checks 1–6) block "Ready"; check 7 (calendar
   below minimum days) is a warning and does not.

Not touching: the uncommitted change in `apps/web/src/auth.ts` (session length) is yours; I'll
leave it out of my commits.
