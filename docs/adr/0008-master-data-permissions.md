# ADR 0008: Permissions for master data

- Status: accepted
- Date: 2026-10-22

## Context

The Phase 1 brief: institute admins edit everything; HODs edit their department's programmes,
courses, batches, sections, faculty and teaching assignments; HODs of service departments
(Applied Sciences) assign only their own faculty; timetable coordinators edit teaching
assignments, fixed slots and timetable scope in their scope; faculty edit only their own
availability. All checks go through `can()` (CLAUDE.md).

## Decision

New actions in `packages/shared/src/auth/permissions.ts`:

| Action                                                                           | institute_admin | hod                                    | timetable_coordinator | faculty                |
| -------------------------------------------------------------------------------- | --------------- | -------------------------------------- | --------------------- | ---------------------- |
| `masterdata.view`, `readiness.view`                                              | ✓               | ✓ institute-wide                       | ✓ institute-wide      | `masterdata.view` only |
| `term.manage`, `calendar.manage` (incl. bell schedules), `infrastructure.manage` | ✓               | –                                      | –                     | –                      |
| `academics.manage`, `cohort.manage`, `faculty.manage`                            | ✓               | own department                         | –                     | –                      |
| `teaching.manage`                                                                | ✓               | own department, or own faculty (below) | own scope             | –                      |
| `fixed_slot.manage`, `timetable_scope.manage`                                    | ✓               | –                                      | own scope             | –                      |
| `faculty.availability.edit`                                                      | ✓               | own department                         | –                     | **own record only**    |
| `import.run`                                                                     | ✓               | ✓                                      | ✓                     | –                      |

Exam coordinators read master data. Students do not: they will see published timetables only.

`Resource` gained three optional fields; `can()` stays pure:

- `departmentId`: the owning department. Batch, cohort, section → the branch's department;
  course → its branches' department (common course → the programme's department; neither →
  institute-only); faculty → home department; teaching assignment → the cohort's department.
  `null` means institute-owned, so only institute-wide roles can change it.
- `facultyDepartmentIds`: for teaching assignments, the home departments of everyone on it. A
  department grant also covers the assignment when **all** of them are that department. So the
  Applied Sciences HOD can put Applied Sciences faculty on a CSE cohort's Maths, but cannot
  add a CSE teacher, and cannot touch an assignment that has nobody on it yet. The CSE HOD
  (the cohort's department) can assign anyone.
- `ownerUserId`: the user linked to a faculty record. `SELF_ONLY_ACTIONS` lists actions that a
  role may only perform on its own record (`faculty` → `faculty.availability.edit`).
  `canSomewhere()` also tries "own record", so faculty pass the route guard for their
  availability page.

`import.run` only opens the import screens; each row is checked again with the action for what
it creates (so a coordinator's faculty import rows fail with "You can't add faculty").

## Consequences

- Tests: `packages/shared/src/auth/can.masterdata.test.ts` covers each row above, including the
  service-department and self-only rules. API e2e tests for the same rules come with the
  endpoints in milestone 1b.
- Services must fill `departmentId` / `facultyDepartmentIds` / `ownerUserId` from the database
  inside the tenant transaction, never from the request body.
