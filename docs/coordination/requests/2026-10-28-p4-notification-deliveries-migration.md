# Migration, RLS and purge order for `notification_deliveries` (P4 notify)

- Stream: P4
- Streams affected: INT (migration, purge list)
- Files: `packages/db/prisma/migrations/<new>_p4_notification_deliveries/migration.sql`,
  `packages/db/src/purge.ts`

Follows `2026-10-27-p4-reschedule-migration.md` (can go in the same migration if that one is
not merged yet).

## What

1. Migration for the `NotificationDelivery` model and `notification_status` enum in
   `packages/db/prisma/schema/reschedule.prisma`, plus the back-relation line
   `notificationDeliveries NotificationDelivery[]` on `Institute` (core.prisma).
   `prisma migrate diff` shows only additions (one enum, one table, one unique index, one FK).
2. Append the SQL below.
3. Add `notification_deliveries` to `TENANT_TABLES_DELETE_ORDER`.

## Why

P4's notify module (milestone 4b) records every email it sends, keyed by the notify.v1
`idempotencyKey`, so a repeated request or a re-delivered queue job never mails a person twice,
and a failed send can be retried. Tenant table, so it needs RLS like the others.

## Exact proposed diff

`packages/db/src/purge.ts`:

```diff
 export const TENANT_TABLES_DELETE_ORDER = [
   'import_rows',
   'import_jobs',
+  'notification_deliveries',
   'make_ups',
```

SQL to append (tested locally on `slotwise_p4` after `prisma db push`):

```sql
-- P4: notification deliveries (docs/adr/0061-notifications.md).
ALTER TABLE "notification_deliveries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notification_deliveries"
  USING (institute_id = app_current_institute_id())
  WITH CHECK (institute_id = app_current_institute_id());
ALTER TABLE "notification_deliveries" ADD CONSTRAINT notification_deliveries_attempts
  CHECK (attempts >= 1);
```
