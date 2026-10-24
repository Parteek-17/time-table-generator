# Request: Progress bar and Skeleton in @slotwise/ui

- From: P1
- To: UI
- Date: 2026-10-24
- Affects: P1 (setup wizard), probably P2T (generation progress) and P5 (portal loading states)

## What

Two small components for the kit:

1. **ProgressBar** — `role="progressbar"` with `aria-valuenow/min/max` and an accessible
   label, value 0..100, a track in `muted` and a bar in `primary`.
2. **Skeleton** — a block placeholder (`animate-pulse`, `muted`, `aria-hidden`) for `loading.tsx`
   files; the shared rules ask every screen for a loading skeleton.

## Why

The setup wizard (`/setup`, `/setup/[step]`) shows overall progress and has loading skeletons.
Until the kit has them, P1 uses local copies:
`apps/web/src/app/(app)/setup/progress.local.tsx` (`ProgressBar`, `SkeletonBlock`).

## Proposed API (what P1 uses today)

```tsx
<ProgressBar value={40} label="Setup 40% done" className="…" />
<Skeleton className="h-8 w-2/3" />
```

When they land, P1 switches to them and deletes the local file.
