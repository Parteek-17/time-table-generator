-- CreateEnum
CREATE TYPE "disruption_kind" AS ENUM ('holiday', 'event', 'faculty_leave', 'room_unavailable', 'other');

-- CreateEnum
CREATE TYPE "disruption_scope" AS ENUM ('institute', 'department', 'section');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('sent', 'failed');

-- CreateTable
CREATE TABLE "disruptions" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "kind" "disruption_kind" NOT NULL,
    "title" TEXT NOT NULL,
    "scope_type" "disruption_scope" NOT NULL,
    "department_id" UUID,
    "section_id" UUID,
    "faculty_id" UUID,
    "room_id" UUID,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "start_minute" INTEGER,
    "end_minute" INTEGER,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_by_id" UUID,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "disruptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cancellations" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "disruption_id" UUID,
    "slot_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "course_id" UUID NOT NULL,
    "section_ids" UUID[],
    "faculty_ids" UUID[],
    "periods" INTEGER NOT NULL,
    "slot" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cancellations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "make_ups" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "cancellation_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_period" INTEGER NOT NULL,
    "length" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "room_id" UUID NOT NULL,
    "room_code" TEXT NOT NULL,
    "section_ids" UUID[],
    "faculty_ids" UUID[],
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "make_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "template_key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "user_id" UUID,
    "status" "notification_status" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "disruptions_institute_id_term_id_start_date_idx" ON "disruptions"("institute_id", "term_id", "start_date");

-- CreateIndex
CREATE INDEX "cancellations_institute_id_term_id_date_idx" ON "cancellations"("institute_id", "term_id", "date");

-- CreateIndex
CREATE INDEX "cancellations_disruption_id_idx" ON "cancellations"("disruption_id");

-- CreateIndex
CREATE UNIQUE INDEX "cancellations_institute_id_slot_id_date_key" ON "cancellations"("institute_id", "slot_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "make_ups_cancellation_id_key" ON "make_ups"("cancellation_id");

-- CreateIndex
CREATE INDEX "make_ups_institute_id_term_id_date_idx" ON "make_ups"("institute_id", "term_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_institute_id_idempotency_key_channe_key" ON "notification_deliveries"("institute_id", "idempotency_key", "channel", "recipient");

-- AddForeignKey
ALTER TABLE "disruptions" ADD CONSTRAINT "disruptions_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disruptions" ADD CONSTRAINT "disruptions_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellations" ADD CONSTRAINT "cancellations_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellations" ADD CONSTRAINT "cancellations_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellations" ADD CONSTRAINT "cancellations_disruption_id_fkey" FOREIGN KEY ("disruption_id") REFERENCES "disruptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "make_ups" ADD CONSTRAINT "make_ups_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "make_ups" ADD CONSTRAINT "make_ups_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "make_ups" ADD CONSTRAINT "make_ups_cancellation_id_fkey" FOREIGN KEY ("cancellation_id") REFERENCES "cancellations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- P4: row-level security and integrity rules for the rescheduling tables.
-- See docs/adr/0002-tenancy-and-rls.md and docs/adr/0060-disruptions-cancellations-make-ups.md.

-- 1. Row-level security (same policy as the other tenant tables).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['disruptions', 'cancellations', 'make_ups']
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

-- 2. A disruption names exactly the id its scope needs, ends on or after its start, and has
-- either no times (whole day) or a start before its end.
ALTER TABLE "disruptions" ADD CONSTRAINT disruptions_scope CHECK (
  (scope_type = 'institute' AND department_id IS NULL AND section_id IS NULL)
  OR (scope_type = 'department' AND department_id IS NOT NULL AND section_id IS NULL)
  OR (scope_type = 'section' AND section_id IS NOT NULL)
);
ALTER TABLE "disruptions" ADD CONSTRAINT disruptions_kind_ids CHECK (
  (kind <> 'faculty_leave' OR faculty_id IS NOT NULL)
  AND (kind <> 'room_unavailable' OR room_id IS NOT NULL)
);
ALTER TABLE "disruptions" ADD CONSTRAINT disruptions_dates CHECK (end_date >= start_date);
ALTER TABLE "disruptions" ADD CONSTRAINT disruptions_times CHECK (
  (start_minute IS NULL AND end_minute IS NULL)
  OR (start_minute BETWEEN 0 AND 1440 AND end_minute BETWEEN 0 AND 1440
      AND start_minute < end_minute)
);

-- 3. Sane class values.
ALTER TABLE "cancellations" ADD CONSTRAINT cancellations_periods CHECK (periods >= 1);
ALTER TABLE "make_ups" ADD CONSTRAINT make_ups_cell CHECK (
  start_period >= 1 AND length >= 1
  AND start_minute BETWEEN 0 AND 1440 AND end_minute BETWEEN start_minute AND 1440
);

-- P4: notification deliveries (docs/adr/0061-notifications.md).
ALTER TABLE "notification_deliveries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notification_deliveries"
  USING (institute_id = app_current_institute_id())
  WITH CHECK (institute_id = app_current_institute_id());
ALTER TABLE "notification_deliveries" ADD CONSTRAINT notification_deliveries_attempts
  CHECK (attempts >= 1);
