-- CreateTable
CREATE TABLE "portal_login_codes" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_login_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portal_login_codes_student_id_created_at_idx" ON "portal_login_codes"("student_id", "created_at");

-- CreateIndex
CREATE INDEX "portal_login_codes_institute_id_idx" ON "portal_login_codes"("institute_id");

-- AddForeignKey
ALTER TABLE "portal_login_codes" ADD CONSTRAINT "portal_login_codes_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_login_codes" ADD CONSTRAINT "portal_login_codes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- P5: row-level security for one-time sign-in codes (docs/adr/0002-tenancy-and-rls.md).
ALTER TABLE "portal_login_codes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "portal_login_codes"
  USING (institute_id = app_current_institute_id())
  WITH CHECK (institute_id = app_current_institute_id());
