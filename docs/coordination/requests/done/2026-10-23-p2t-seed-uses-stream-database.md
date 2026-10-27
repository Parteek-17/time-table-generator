# `pnpm db:seed` in a stream worktree seeds the main database

- Stream: P2T
- Streams affected: every stream with a worktree (P1, UI, P2T, P4, P5, P6, P7)
- Files: `packages/db/prisma/seed.ts` (and the same pattern in `packages/db/scripts/build-fixtures.ts`)

## What

In `../slotwise-p2t`, `pnpm db:seed` wrote the demo institute into `slotwise` (the main
database), not `slotwise_p2t` from `packages/db/.env.local`. `pnpm db:deploy` used the right
database (prisma.config.ts reads `.env.local` first).

Cause: importing `PrismaClient` from `../src/index` loads `packages/db/.env` into
`process.env` before `seed.ts` calls `process.loadEnvFile('.env.local')`, and `loadEnvFile`
does not overwrite variables that are already set. So `OWNER_DATABASE_URL` keeps the
`.env` value.

Second, smaller one: in a fresh worktree `pnpm db:seed` fails with
`Cannot find module …/@slotwise/shared/dist/index.js` until `pnpm --filter @slotwise/shared build`
has run once.

## Why

Stream seeds (p2t.ts and later p4/p5/p6/p7) write into the wrong database, and P1's seed
silently re-runs against main. Workaround P2T uses today:
`OWNER_DATABASE_URL=<value from packages/db/.env.local> pnpm db:seed`.

## Exact proposed diff

```diff
--- a/packages/db/prisma/seed.ts
+++ b/packages/db/prisma/seed.ts
-import { existsSync } from 'node:fs';
+import { existsSync, readFileSync } from 'node:fs';
 import { join } from 'node:path';
+import { parseEnv } from 'node:util';
 import { PrismaClient } from '../src/index';
@@
-// .env.local (stream worktree overrides, scripts/stream-env.mjs) wins over .env.
-for (const file of ['.env.local', '.env']) {
-  try {
-    process.loadEnvFile(file);
-  } catch {
-    // No .env file: rely on the environment (CI, hosted DBs).
-  }
-}
-
-const prisma = new PrismaClient();
+// .env.local (stream worktree overrides, scripts/stream-env.mjs) wins over .env, even though
+// importing the Prisma client has already loaded .env into process.env.
+const local = existsSync('.env.local') ? parseEnv(readFileSync('.env.local', 'utf8')) : {};
+const prisma = new PrismaClient({
+  datasourceUrl: local.OWNER_DATABASE_URL ?? process.env.OWNER_DATABASE_URL,
+});
```

and in `packages/db/package.json` (so a fresh worktree can seed):

```diff
-    "seed": "tsx prisma/seed.ts",
+    "seed": "pnpm --filter @slotwise/shared build && tsx prisma/seed.ts",
```
