# A timeout option for `withTenant()` / `PrismaService.tenant()`

- Stream: P2T
- Streams affected: INT (any stream writing a few hundred rows in one tenant transaction)
- Files: `packages/db/src/index.ts`, `apps/api/src/db/prisma.service.ts`

## What

`withTenant()` uses Prisma's interactive transaction with the default 5-second limit. On the
2-core dev laptop, saving a generated draft (one version + ~400 slots) took 5.1 s on a cold dev
server and the solve job failed ("Transaction already closed … 5000 ms"). P2T's solve worker now
writes its draft as one batch transaction (`$transaction([...])`, RLS `set_config` first), which
has no such limit. Copying a version (Make an editable copy, Undo publishing) still writes ~400
slots inside `tenant()`.

Please add an optional options argument, passed through to `$transaction`:

```diff
 export async function withTenant<T>(
   prisma: PrismaClient,
   ctx: TenantContext,
   fn: (tx: TxClient) => Promise<T>,
+  options?: { timeout?: number; maxWait?: number },
 ): Promise<T> {
   return prisma.$transaction(async (tx) => {
     …
-  });
+  }, options);
 }
```

and the same parameter on `PrismaService.tenant()`. P2T would then pass `{ timeout: 30_000 }`
for copies and publishes, and could go back to `tenant()` in the worker.

## Why

Slow hosts (the dev laptop, small Railway instances) otherwise lose work at random.
