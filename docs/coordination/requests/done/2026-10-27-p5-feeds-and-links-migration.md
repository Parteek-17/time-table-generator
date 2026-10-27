# Migration, RLS and purge order for P5's calendar feeds and public links

- Stream: P5
- Streams affected: INT (migration, purge list), all streams' local databases
- Files: `packages/db/prisma/migrations/<new>_p5_feeds_and_links/migration.sql`,
  `packages/db/src/purge.ts`

## What

1. Write the migration for `PortalCalendarFeed`, `PortalPublicLink` and the
   `PortalLinkKind` enum in `portal.prisma` (plus the back-relation lines on `Institute` and
   `User`). Can be the same migration as requests/2026-10-27-p5-login-codes-migration.md.
2. Append the RLS SQL below.
3. Add `'portal_calendar_feeds'` and `'portal_public_links'` to `TENANT_TABLES_DELETE_ORDER`
   (anywhere before `institutes`; nothing references them).

## Why

iCal subscriptions and public notice-board links (ADR 0071). Applied locally to `slotwise_p5`
with exactly this SQL; API e2e `portal-links` (4) passes on it and skips itself without it.

## Exact proposed diff

```sql
-- CreateEnum
CREATE TYPE "portal_link_kind" AS ENUM ('section', 'room');

-- CreateTable
CREATE TABLE "portal_calendar_feeds" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "portal_calendar_feeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_public_links" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "kind" "portal_link_kind" NOT NULL,
    "target_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "portal_public_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portal_calendar_feeds_user_id_idx" ON "portal_calendar_feeds"("user_id");

-- CreateIndex
CREATE INDEX "portal_calendar_feeds_institute_id_idx" ON "portal_calendar_feeds"("institute_id");

-- CreateIndex
CREATE INDEX "portal_public_links_institute_id_kind_target_id_idx" ON "portal_public_links"("institute_id", "kind", "target_id");

-- AddForeignKey
ALTER TABLE "portal_calendar_feeds" ADD CONSTRAINT "portal_calendar_feeds_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_calendar_feeds" ADD CONSTRAINT "portal_calendar_feeds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_public_links" ADD CONSTRAINT "portal_public_links_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_public_links" ADD CONSTRAINT "portal_public_links_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- P5: row-level security for calendar feeds and public links (docs/adr/0002-tenancy-and-rls.md).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['portal_calendar_feeds', 'portal_public_links']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (institute_id = app_current_institute_id())
         WITH CHECK (institute_id = app_current_institute_id())',
      t
    );
  END LOOP;
END
$$;
```

`packages/db/src/purge.ts`:

```diff
+  'portal_calendar_feeds',
+  'portal_public_links',
```
