## What and why

<!-- One or two sentences. Link the issue if there is one. -->

## How to check

<!-- Steps a reviewer can follow, e.g. "sign in as admin@demo.slotwise.test, open Members". -->

## Checklist

- [ ] Permission checks use `can()`; no inline role strings
- [ ] New tenant tables have `institute_id` and an RLS policy (with a test)
- [ ] UI works at 400px width, uses plain words, strings are in `messages/en.json`
- [ ] Constraint changes have a solver test fixture
- [ ] Decisions not covered by CLAUDE.md are recorded in `docs/adr/`
