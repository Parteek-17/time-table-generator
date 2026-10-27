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
