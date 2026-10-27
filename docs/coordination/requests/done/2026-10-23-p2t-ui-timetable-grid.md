# TimetableGrid, SlotCard and a few small pieces for the UI kit

- Stream: P2T
- Streams affected: UI (builds them), P4 and P5 (will show timetables too)
- Files: `packages/ui/src/*`

## What

P2T built these locally in `apps/web/src/app/(app)/timetable/` because the kit doesn't have them
yet. Please add kit versions with the same props; P2T swaps its imports when they land.

| Local file                 | Kit component   | Props                                                       |
| -------------------------- | --------------- | ----------------------------------------------------------- |
| `slot-card.local.tsx`      | `SlotCard`      | `slot: ViewSlot`, `kind: ViewKind`, `whoName`, `className?` |
| `timetable-grid.local.tsx` | `TimetableGrid` | `bell: GridBell`, `slots: ViewSlot[]`, `kind`, `whoName`    |

Types come from `@slotwise/shared/timetable` (`ViewSlot`, `ViewKind`, `GridBell`); the layout
model is `gridColumns()` / `dayCells()` from the same place (tested), so the kit component only
draws. Behaviour to keep: lab blocks span their periods (and a short break inside them); classes
that overlap share one cell; breaks are a narrow column labelled once; the grid scrolls sideways
inside its own `relative` box (sr-only labels otherwise widen the page); "Lab"/"Tut" written on
the card, never colour alone; one `aria-label` per card with the full sentence.

Also useful for every stream (P2T has inline versions):

- a segmented control (`role="group"` of `aria-pressed` buttons) — `view-picker.tsx`, `day-view.tsx`;
- a progress bar (`role="progressbar"` with a live text line) — `generate/generate-form.tsx`;
- a skeleton block (`animate-pulse rounded-lg bg-muted motion-reduce:animate-none`) — `loading.tsx`.

## Why

P4 (rescheduled weeks) and P5 (student and faculty portals) will draw the same grid; one kit
component keeps them looking the same.

## Exact proposed diff

New files `packages/ui/src/timetable-grid.tsx`, `slot-card.tsx`, `segmented.tsx`,
`progress.tsx`, `skeleton.tsx`, exported from `packages/ui/src/index.ts`. Start from P2T's local
files; `@slotwise/ui` would then depend on `@slotwise/shared` for the types and `next-intl`
for labels, or take the strings as props (UI's call).

## Also (INT)

`.claude/launch.json` has one `dev` entry on port 3000, so the browser preview can't start a
stream worktree (P2T runs on 3003). P2T added an entry locally to test and removed it before
committing. Suggested addition:

```json
{
  "name": "stream-dev",
  "runtimeExecutable": "pnpm",
  "runtimeArgs": ["dev"],
  "port": 3003,
  "url": "http://demo.localhost:3003"
}
```

(or one entry per stream port from `scripts/lib/streams.mjs`).
