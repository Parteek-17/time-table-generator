# Merge order

INT merges pull requests into `main` in this order:

1. **P1** Institute setup (1c wizard, 1d imports, 1e teaching grid + readiness, 1f FET import)
2. **UI** Design system
3. **P2E** Timetable engine (solver)
4. **P2T** Timetable module
5. **P4** Rescheduling
6. **P6** Exam seating
7. **P5** Portals
8. **P7** SaaS launch

Any stream may merge earlier if its feature flag is off (`packages/shared/src/flags.ts`) and CI
passes, including `pnpm check:ownership`.

Before asking INT to merge: `git fetch && git rebase origin/main`, all checks green, status file
updated (including "Last pushed"), open requests listed there.

INT, on each merge:

- writes the migration for any new or changed `packages/db/prisma/schema/*.prisma` file
  (streams never commit migrations) and checks `prisma migrate diff` is empty afterwards;
- resolves `pnpm-lock.yaml` and neighbouring back-relation lines in `.prisma` files;
- moves handled files in `requests/` to `requests/done/` or `requests/rejected/`;
- folds accepted `claude-md-proposals/<STREAM>.md` into `CLAUDE.md`.
