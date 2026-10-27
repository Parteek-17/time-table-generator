# `exam.view` and `exam.manage` actions for exam coordinators

- Stream: P6
- Streams affected: P5 (student/faculty portals may show exam seats and duties later)
- Files: `packages/shared/src/auth/permissions.ts`, `packages/shared/src/auth/can.test.ts`

## What

Two new actions:

- `exam.view`: read date sheets, seating plans, duty charts (all staff).
- `exam.manage`: exams, date sheets, seating plans, invigilation, publishing them.

`exam_coordinator` (institute scope) gets both; it has only `READ_ONLY` today, so an exam
coordinator cannot do the one job CLAUDE.md gives the role. `institute_admin`,
`university_admin` and `platform_admin` get them through `ALL`. Students and faculty read only
their own seat or duties; P6 checks that per record (own student / faculty row), not with an
action.

## Why

Until this lands P6 maps the checks onto existing actions
(`apps/api/src/exams/exam-permissions.ts`): `masterdata.view` for reading and
`institute.manage` for changes, so only institute admins can build date sheets and seating.

## Exact proposed diff

```diff
--- a/packages/shared/src/auth/permissions.ts
+++ b/packages/shared/src/auth/permissions.ts
@@ export const ACTIONS = [
   'import.run',
   'readiness.view',
+  // Phase 6: exams (date sheets, seating, invigilation)
+  /** Read date sheets, seating plans and duty charts. */
+  'exam.view',
+  /** Exams, date sheets, seating plans, invigilation and publishing them. */
+  'exam.manage',
 ] as const;
@@ const READ_ONLY: readonly Action[] = [
   'timetable.view',
   'masterdata.view',
+  'exam.view',
 ];
@@ export const ROLE_PERMISSIONS
-  exam_coordinator: READ_ONLY,
+  exam_coordinator: [...READ_ONLY, 'exam.manage'],
```

Plus a `can.test.ts` case: an exam coordinator may `exam.manage` in their institute and not in
another; a HOD and a timetable coordinator may not.
