# ADR 0030: UI kit components for progress, loading, choices and timetables

- Status: accepted (UI, milestone "kit")
- Date: 2026-10-27

## Context

P1 and P2T built local stand-ins because `@slotwise/ui` had only buttons, cards, fields and
alerts (requests `2026-10-24-p1-ui-progress-and-skeleton.md` and
`2026-10-23-p2t-ui-timetable-grid.md`). P4 and P5 will draw the same week grid. CLAUDE.md asks
for phone-first screens, keyboard access, screen-reader labels, never colour alone, and every
string in i18n files.

## Decision

Five components in `packages/ui/src`, exported from `@slotwise/ui`, with the props the streams
already use so switching is an import change:

| Component          | File                 | Notes                                                                                                                                                        |
| ------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ProgressBar`      | `progress.tsx`       | `role="progressbar"`, `aria-valuenow/min/max/text`, `label`. Optional `status` line (`aria-live="polite"`) and `minVisible` sliver.                          |
| `Skeleton`         | `skeleton.tsx`       | `aria-hidden`, `animate-pulse` off under `prefers-reduced-motion`. The loading region carries `aria-busy`.                                                   |
| `SegmentedControl` | `segmented.tsx`      | `role="group"` of `aria-pressed` buttons. Every button is a tab stop; arrows/Home/End also move. Chosen = filled **and bold**. `size="lg"` = 44px.           |
| `SlotCard`         | `slot-card.tsx`      | Same props as P2T's local card (`slot`, `kind`, `whoName`, `className?`, `actions?`). "Lab", "Tut", "Locked" written on the card; one `aria-label` sentence. |
| `TimetableGrid`    | `timetable-grid.tsx` | Same props as P2T's (`bell`, `slots`, `kind`, `whoName`, plus `className?`). Layout from `gridColumns()`/`dayCells()` in shared; draws only.                 |

**Strings.** Generic components (`ProgressBar`, `SegmentedControl`) take their text as props.
The timetable components read `ui.timetable.*` and `ui.days.*` from
`apps/web/messages/en/ui.json` with `next-intl`'s `useTranslations`, which works in server and
client components. Passing ~15 labels into every grid would be noise for P2T, P4 and P5, and
the kit is only consumed by `apps/web`, which already provides next-intl. So `@slotwise/ui` now
depends on `@slotwise/shared` (types, `formatTime`, grid layout) and has `next-intl` as a peer
dependency. The strings duplicate `p2t.grid.*` / `p2t.days.*` under new keys until P2T deletes
its local copies; P2T keeps its own `days.*` for the rest of its screens.

**Grid at phone width.** The table keeps `min-w-[56rem]` and scrolls sideways inside its own
`relative` box (so `sr-only` labels don't widen the page); the box is a labelled, focusable
`region` so keyboard users can scroll it with arrow keys. The day column is sticky. On phones
screens should still prefer a day-at-a-time list (P2T's `DayView`), which can use
`SegmentedControl size="lg"` for the day buttons and `SlotCard` for the classes.

**Forced colours** (Windows high contrast): the progress fill uses `Highlight`, the chosen
segment gets an outline and cards get a `CanvasText` border, since background tints vanish.

**Tests.** Vitest renders components to static HTML with `react-dom/server` inside
`NextIntlClientProvider` with the real `ui.json`, and asserts roles, labels and structure; the
keyboard logic is a pure function (`segmentedKeyTarget`) tested directly. No DOM library was
added. `apps/web/src/app/(dev)/ui` is the gallery for checking them by eye at 400px and in dark
mode.

## Consequences

- P1 can delete `setup/progress.local.tsx`; P2T can delete `slot-card.local.tsx` and
  `timetable-grid.local.tsx` and use `SegmentedControl`, `ProgressBar` and `Skeleton` in place of
  inline copies (list in `docs/coordination/status/UI.md`).
- A label change for the grid is a change to `ui.json` (UI owns it).
- Another app consuming the kit would need a next-intl provider, or we split the timetable
  components into their own entry point then.
