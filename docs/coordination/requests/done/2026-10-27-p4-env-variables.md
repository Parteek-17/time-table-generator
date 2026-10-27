# P4 environment variable in env.ts and .env.example

- Stream: P4
- Streams affected: INT
- Files: `apps/api/src/config/env.ts`, `apps/api/.env.example`

## What

Add P4's one setting. Until then P4 reads it in `apps/api/src/reschedule/reschedule.config.ts`
(as P2T did with `timetable.config.ts`).

## Why

`RESCHEDULE_SOURCE` picks where P4 reads the term's setup and published timetable:
`api` (default; P1's snapshot route and P2T's timetable-read route, called as the user) or
`fixture` (the demo fixtures, for working without P2T).

## Exact proposed diff

`apps/api/.env.example`:

```diff
+# Rescheduling (P4). api = read GET /terms/:termId/snapshot and GET /terms/:termId/timetable
+# as the user; fixture = demo-term.snapshot.json and demo-term.published-timetable.json.
+RESCHEDULE_SOURCE="api"
```

`apps/api/src/config/env.ts` (in the schema):

```diff
+  /** Where P4 reads setup and published timetables: api (default) or fixture. */
+  RESCHEDULE_SOURCE: z.enum(['api', 'fixture']).default('api'),
```
