# UI status

## Current milestone

Kit — ProgressBar, Skeleton, SegmentedControl, SlotCard, TimetableGrid: done (branch `ui/kit`,
from `main` at 271f570). `@slotwise/ui` lint, typecheck and 20 unit tests pass. Not yet checked
by eye in a browser (no dev server started on this laptop): open `/ui` at 400px, light and
dark, before merging.

## Done

- `ProgressBar` (`role="progressbar"`, value text, optional polite status line, `minVisible`),
  `Skeleton` (`aria-hidden`, no pulse under reduced motion), `SegmentedControl` (`aria-pressed`
  buttons, arrows/Home/End, bold + filled when chosen, `size="lg"` 44px).
- `SlotCard`, `TimetableGrid`: same props as P2T's local copies; strings in `ui.json`
  (`ui.timetable.*`, `ui.days.*`); the card's sentence also says "Locked."
- `/ui` gallery (development only, flag `UI`) with every component and a fictional week.
- ADR 0030.

## For INT: files that can switch to the kit

Not switched by UI (they belong to P1 and P2T). After `ui/kit` is merged:

| File                                                                    | Owner | Change                                                                                             |
| ----------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/(app)/setup/page.tsx`                                 | P1    | `ProgressBar` from `@slotwise/ui`                                                                  |
| `apps/web/src/app/(app)/imports/[id]/page.tsx`                          | P1    | `ProgressBar` from `@slotwise/ui`                                                                  |
| `apps/web/src/app/(app)/setup/loading.tsx`                              | P1    | `SkeletonBlock` → `Skeleton`                                                                       |
| `apps/web/src/app/(app)/setup/[step]/loading.tsx`                       | P1    | `SkeletonBlock` → `Skeleton`                                                                       |
| `apps/web/src/app/(app)/setup/progress.local.tsx`                       | P1    | delete                                                                                             |
| `apps/web/src/app/(app)/timetable/page.tsx`                             | P2T   | `TimetableGrid` from `@slotwise/ui`                                                                |
| `apps/web/src/app/(app)/timetable/day-view.tsx`                         | P2T   | `SlotCard` from the kit; day buttons → `SegmentedControl size="lg"` (option `className` for today) |
| `apps/web/src/app/(app)/timetable/timetable-editor.tsx`                 | P2T   | `SlotCard` from the kit (`actions` prop kept)                                                      |
| `apps/web/src/app/(app)/timetable/view-picker.tsx`                      | P2T   | inline button group → `SegmentedControl`                                                           |
| `apps/web/src/app/(app)/timetable/generate/generate-form.tsx`           | P2T   | inline bar → `ProgressBar status={label} minVisible={3}`                                           |
| `apps/web/src/app/(app)/timetable/loading.tsx`                          | P2T   | inline blocks → `Skeleton`                                                                         |
| `apps/web/src/app/(app)/timetable/{slot-card,timetable-grid}.local.tsx` | P2T   | delete; then unused `p2t.grid.*` keys can go                                                       |

`apps/web/src/components/availability-grid.tsx` (P1) has its own `aria-pressed` grid of
periods; it is a different widget (many toggles, not one choice) and stays as it is.

## Next

- Check `/ui` in a browser at 400px, light and dark.
- Requests from P4, P5 and P6 as they come.

## Blocked by

Nothing.

## New dependencies

`@slotwise/ui`: `@slotwise/shared` (workspace), peer `next-intl` 4.14.9; dev `next-intl`,
`react-dom` 19.3.1, `@types/react-dom` 19.3.0, `vitest` 4.1.12 (versions already used
elsewhere in the repo). New script `test` in `packages/ui`.

## Env variables added

None.

## Contract change requests

- `requests/2026-10-27-ui-ownership-lockfile-owned-package.md`: `check:ownership` flags
  `pnpm-lock.yaml` on `ui/kit` because UI owns all of `packages/ui` (script fix proposed).

## Last pushed

Not pushed (the user pushes).
