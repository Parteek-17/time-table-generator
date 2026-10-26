# Request: seed, fixtures and DB tests ignore a stream's `.env.local`

- From: P1
- To: INT
- Date: 2026-10-23
- Affects: every stream that runs `pnpm db:seed`, `pnpm fixtures:build` or `@slotwise/db` tests
  in its own worktree

## What happens

In a stream worktree (`packages/db/.env.local` → `slotwise_p1`), `pnpm db:deploy` migrates
the stream database, but `pnpm db:seed` and the `packages/db` tests run against the **main**
`slotwise` database.

Cause: these files import the Prisma client before they load `.env.local`:

- `packages/db/prisma/seed.ts` (`import { PrismaClient } from '../src/index'`, then the
  `loadEnvFile` loop)
- `packages/db/scripts/build-fixtures.ts`
- `packages/db/test/rls.test.ts`, `packages/db/test/sample.test.ts`

Importing `@prisma/client` loads `packages/db/.env` into `process.env` (the generated client
does this on import). `process.loadEnvFile('.env.local')` then **does not override** variables
that are already set, so `OWNER_DATABASE_URL` / `APP_DATABASE_URL` keep the main database's
values.

Seen in P1's worktree: the seed printed "Master data already present" against an empty, freshly
migrated `slotwise_p1`; the rows it counted were in `slotwise`. The API is not affected (it
uses `DATABASE_URL`, which `packages/db/.env` does not set).

## Proposed fix

Load the env files before anything imports Prisma, in one place:

```ts
// packages/db/src/load-env.ts (new)
/**
 * Loads .env.local (stream worktree overrides) then .env. Import this FIRST, before
 * anything that imports @prisma/client, which loads packages/db/.env on import and would
 * otherwise win (process.loadEnvFile never overrides a variable that is already set).
 */
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Missing file: rely on the environment (CI, hosted DBs).
  }
}
```

and as the first import in each of the four files above:

```diff
+import '../src/load-env';
 import { PrismaClient } from '../src/index';
```

(`build-fixtures.ts`: `import '../src/load-env';`; the tests: `import '../src/load-env';`), and
remove their local `loadEnvFile` loops.

## Workaround until then

In a stream worktree, export the stream values first:

```bash
set -a; . packages/db/.env.local; set +a; pnpm db:seed
```

P1 uses this for `pnpm db:seed` and `pnpm test`.
