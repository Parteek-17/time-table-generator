# Redis service in CI for queue tests

- Stream: P1
- Streams affected: P1, P2T (and any stream that uses `QueueService`)
- Files: `.github/workflows/ci.yml` (INT)

## What

Add a Redis service to the TypeScript job so API tests that go through BullMQ can run in CI.
`REDIS_URL` can stay unset: the API's default is `redis://localhost:6379`.

## Why

CI has Postgres but no Redis. P1's "Try with sample data" loads the sample on the
`p1.sample-data` queue, so its e2e test (`apps/api/test/masterdata-setup.e2e.test.ts`,
"try with sample data") is skipped when Redis is not reachable. P2T's generate tests are in the
same position. With Redis in CI both run there too.

Until then, P1's worker starts only when a job is queued under `NODE_ENV=test`, so the other
API tests no longer wait for Redis when the app closes.

## Exact proposed diff

```diff
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ services:
       postgres:
         image: postgres:16.15-alpine
         ...
         options: >-
           --health-cmd "pg_isready -U slotwise -d slotwise"
           --health-interval 5s --health-timeout 3s --health-retries 20
+      redis:
+        image: redis:7.4.11-alpine
+        ports: ['6379:6379']
+        options: >-
+          --health-cmd "redis-cli ping"
+          --health-interval 5s --health-timeout 3s --health-retries 20
```
