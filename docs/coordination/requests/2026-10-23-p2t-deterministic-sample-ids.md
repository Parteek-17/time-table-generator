# Make the sample institute's ids deterministic, so fixtures match the seeded database

- Stream: P2T
- Streams affected: P1 (owner of `packages/db/src/sample/**`), INT (fixtures), P2E, P4, P5, P6
- Files: `packages/db/src/sample/build.ts`, `packages/shared/fixtures/*` (rebuilt)

## What

`buildSampleInstitute()` gives every row a `randomUUID()`. The fixtures were built from one
seeded database, so their ids (term `a4e56987…`, sections, faculty, rooms, assignments) exist in
no other database. In a freshly seeded stream database nothing in
`demo-term.snapshot.json` / `demo-term.solution.json` / `demo-term.published-timetable.json`
can be found by id.

Proposal: derive each id from the institute id and a running counter, so the same institute
always gets the same ids, and different institutes still get different ones.

## Why

The P2T prompt's fixture mode (`SNAPSHOT_SOURCE=fixture`, `SOLVER_SOURCE=mock`) and the
Playwright flow need the fixture's sections, faculty and rooms to be the ones the demo
institute's screens show. P4/P5/P6 will hit the same thing when they join fixture data
(published slots, seating) to the seeded institute.

P2T works around it today: slots carry copies of names (ADR 0050), and `seed/p2t.ts`
publishes the fixture solution under the demo institute's term by label. Section, faculty and
room ids in that timetable are still the fixture's, not the database's.

## Exact proposed diff

```diff
--- a/packages/db/src/sample/build.ts
+++ b/packages/db/src/sample/build.ts
-import { randomUUID } from 'node:crypto';
+import { createHash } from 'node:crypto';
+
+/**
+ * Ids that are the same every time the same institute is built (fixtures built from the demo
+ * institute then match any freshly seeded database), and unique per institute.
+ */
+function idSequence(instituteId: string): () => string {
+  let n = 0;
+  return () => {
+    const h = createHash('sha256').update(`${instituteId}:${++n}`).digest('hex');
+    // RFC 4122 layout, version 4 bits, so z.uuid() accepts it.
+    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
+  };
+}
```

then, inside `buildSampleInstitute()`, `const nextId = idSequence(institute.id);` and every
`randomUUID()` → `nextId()`. The demo institute's own id comes from `upsert` by slug in
`seed/p1.ts`; for full determinism give it a fixed id there too (e.g. `idSequence('demo')()`).
Afterwards: `pnpm db:reset && pnpm fixtures:build` and commit the regenerated fixtures (INT).
