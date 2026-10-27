# Students and teachers land on "Today"

- Stream: P5
- Streams affected: INT (home page)
- Files: `apps/web/src/app/page.tsx`

## What

When the P5 flag is on, send a signed-in user whose only access here is reading timetables
(no setup, no member management) to `/today` instead of the generic welcome page. Admins keep
their home screen; they reach Today from the "My timetable" nav group.

## Why

CLAUDE.md "Role-shaped home screens": students and faculty land on "Today". `page.tsx` is
INT's. The check uses `canSomewhere()` (no role names), so it stays inside the `can()` rule.
The portal itself decides student vs teacher from their records and explains plainly when a
sign-in isn't linked to either.

## Exact proposed diff

```diff
-import { canSomewhere, type InstituteDto, type MeResponse } from '@slotwise/shared';
+import { canSomewhere, isFlagOn, type InstituteDto, type MeResponse } from '@slotwise/shared';
@@
   const canManageMembers = canSomewhere(authUser, 'member.view', place);
   const canSetUp = canSomewhere(authUser, 'masterdata.view', place);
+  // Students and teachers land on "Today" (CLAUDE.md "Role-shaped home screens").
+  if (isFlagOn('P5') && !joined && !canManageMembers && !canSetUp) redirect('/today');
   const shellMe = await getMe();
```

Note: `faculty` has `masterdata.view` (READ_ONLY in permissions.ts), so with this exact check
teachers would still see the welcome page. If INT prefers teachers to land on Today too, use
`!canSomewhere(authUser, 'timetable.edit', place) && !canManageMembers && !canSomewhere(authUser, 'import.run', place)`
instead of `!canSetUp` (faculty and students hold none of these).
