-- CreateTable
CREATE TABLE "institute_subscriptions" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "plan_code" TEXT NOT NULL,
    "trial_ends_on" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institute_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "institute_subscriptions_institute_id_key" ON "institute_subscriptions"("institute_id");

-- AddForeignKey
ALTER TABLE "institute_subscriptions" ADD CONSTRAINT "institute_subscriptions_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- P7: row-level security (same policy as the other tenant tables).
ALTER TABLE "institute_subscriptions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "institute_subscriptions"
  USING (institute_id = app_current_institute_id())
  WITH CHECK (institute_id = app_current_institute_id());
