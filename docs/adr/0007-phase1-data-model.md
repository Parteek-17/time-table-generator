# ADR 0007: Phase 1 master-data model

- Status: accepted
- Date: 2026-10-22

## Context

Phase 1 adds the master data a timetable needs: programmes, schemes, terms, calendar, batches,
cohorts, sections, faculty, rooms and teaching assignments (plan: `docs/phase1/plan.md`). The
brief adds ideas CLAUDE.md does not cover yet: cohorts per term, sub-groups, elective sections,
fixed slots, lateral entry and cohort start-date windows. Every table must stay inside the
row-level security model of ADR 0002.

## Decision

**Shape**

- A **Batch** is students admitted to one branch in one year by one entry route. A **Cohort** is
  a batch in one term; its semester comes from `semesterFor()` in `packages/shared` and is stored
  so an admin can override it. **Sections and sub-groups belong to a cohort**, so they are per
  term. "Promote batches" copies them into the next term's cohorts.
- **Lateral entry:** a LEET batch has its own cohort (own start window, own teaching-day count),
  and by default **sits in the regular cohort's sections** (`Cohort.joinsCohortId`). Its
  students are counted in those sections' strength, so the joining cohort has no sections.
- A **Course** belongs to a scheme version and a semester and lists the branches it is for
  (`CourseBranch`); no branches means common to all. Electives are regrouped into
  **ElectiveSections** that record the regular sections they draw from (needed in Phase 2 to keep
  those sections free during the elective). An elective course with no elective sections in a
  term is not offered that term.
- **Programme.department** is optional: B.Tech spans departments, its branches carry them.
- **Bell schedule:** period rows are the source of truth; break rows must match the gaps
  (`validateBellSchedule()`). One default per institute, optional overrides per programme and
  semester (e.g. first year).
- **Teaching days:** mid-semester exams, orientation, vacation and training windows are not
  teaching days. Working Saturdays are `ExtraWorkingDay` rows ("follows Monday's timetable").
- **Load defaults:** experienced 4 periods/day and 14/week, fresher 5/day and 18/week, copied onto
  each faculty row on create and editable.
- **Readiness:** checks 1–6 are errors and block "Ready"; check 7 (too few teaching days) is a
  warning. Under-loaded faculty are listed, not reported as issues.

**Conventions forced by row-level security**

1. **No implicit many-to-many.** Prisma's implicit join tables cannot carry `institute_id`, so
   every join is an explicit model with `institute_id` and the tenant policy.
2. **Every tenant table** gets `ENABLE ROW LEVEL SECURITY` and the `tenant_isolation` policy
   (migration `*_phase1_rls_and_checks`). `packages/db/test/rls.test.ts` now discovers every table
   with an `institute_id` column from the catalog and fails if one has no policy, so a new table
   cannot be forgotten.
3. **Cross-tenant references.** Foreign-key checks bypass RLS, so a bug could link institute A's
   section to institute B's room. Services must resolve every referenced id inside the tenant
   transaction first (RLS hides foreign rows, so the lookup fails). Composite
   `(institute_id, id)` foreign keys were rejected: Prisma handles them poorly for optional
   relations.
4. **Scoped rows** (holidays, calendar windows, extra working days, fixed slots) use
   `scope_type` plus real FK columns (`department_id`, `programme_id`, `cohort_id`,
   `section_id`) with a CHECK that exactly the matching one is set. No free-text ids.
5. Soft delete keeps Phase 0's `deleted_at` (the UI says "Archive"). Natural-key unique
   constraints include archived rows, so re-adding an archived code means restoring it.
6. Partial unique indexes enforce one active term, one default bell schedule, one default
   branch per programme, and one live teaching assignment per (term, course, component, target).

**Sample data** lives in `packages/db/src/sample/` as plain tables plus a builder that only
writes rows of the given institute through the caller's transaction. The seed uses it as owner;
"Try with sample data" (1c) will use it as the app role under RLS. `PLANNED_GAPS` lists the
deliberate readiness issues and `packages/db/test/sample.test.ts` asserts them exactly.

## Consequences

- Phase 2 reads a term's data through `loadReadinessSnapshot()` / the `Plan*` types in
  `packages/shared`, which are already the solver's input shape minus time slots.
- Section-scoped memberships (`scope_type = 'section'`) would point at last term's section after
  promotion. None are issued in Phase 1; student access in Phase 5 will resolve through
  `Student.sectionId` instead.
- Tests that create institutes clean up with `purgeInstitute()` (owner connection), whose table
  list the RLS test keeps complete.
