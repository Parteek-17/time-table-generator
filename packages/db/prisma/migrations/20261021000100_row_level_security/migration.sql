-- Row-level security for tenant tables. See docs/adr/0002-tenancy-and-rls.md.
--
-- The API and web connect as "slotwise_app": not the table owner and no BYPASSRLS,
-- so these policies always apply to them. Each request runs in a transaction that
-- calls set_config('app.institute_id', <id>, true) (= SET LOCAL).

-- 1. App role ---------------------------------------------------------------
-- Dev (docker-compose) creates it as a LOGIN role with a password before migrations run.
-- Elsewhere it is created here as NOLOGIN; give it a password or grant it to a login role
-- (see docs/deployment.md).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'slotwise_app') THEN
    CREATE ROLE slotwise_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO slotwise_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO slotwise_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO slotwise_app;
-- Tables created by later migrations get the same grants automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO slotwise_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO slotwise_app;
-- The app never touches migration history (the table is absent in Prisma's shadow DB).
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON TABLE "_prisma_migrations" FROM slotwise_app;
  END IF;
END
$$;
-- Audit log is append-only for the app.
REVOKE UPDATE, DELETE ON TABLE "audit_logs" FROM slotwise_app;

-- 2. Helpers ----------------------------------------------------------------
-- current_setting(..., true) returns NULL/'' when unset, so "no tenant" matches no rows.
CREATE OR REPLACE FUNCTION app_current_institute_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.institute_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

-- 3. Policies ---------------------------------------------------------------
-- Policies are not FORCEd: the owner role (migrations, seed) is trusted and bypasses them.
-- The API refuses to start if its own login owns these tables or can bypass RLS
-- (apps/api/src/db/prisma.service.ts), so the app can never run unrestricted.

-- departments
ALTER TABLE "departments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "departments"
  USING (institute_id = app_current_institute_id())
  WITH CHECK (institute_id = app_current_institute_id());

-- memberships: a user may also read their own memberships elsewhere (to know where they
-- belong), but may only write rows of the current institute.
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON "memberships" FOR SELECT
  USING (institute_id = app_current_institute_id() OR user_id = app_current_user_id());
CREATE POLICY tenant_insert ON "memberships" FOR INSERT
  WITH CHECK (institute_id = app_current_institute_id());
CREATE POLICY tenant_update ON "memberships" FOR UPDATE
  USING (institute_id = app_current_institute_id())
  WITH CHECK (institute_id = app_current_institute_id());
CREATE POLICY tenant_delete ON "memberships" FOR DELETE
  USING (institute_id = app_current_institute_id());

-- invites
ALTER TABLE "invites" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "invites"
  USING (institute_id = app_current_institute_id())
  WITH CHECK (institute_id = app_current_institute_id());

-- audit_logs
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_logs"
  USING (institute_id = app_current_institute_id())
  WITH CHECK (institute_id = app_current_institute_id());

-- 4. Integrity ---------------------------------------------------------------
-- At most one active membership per (user, role, scope).
CREATE UNIQUE INDEX memberships_active_unique
  ON "memberships" (user_id, role, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE revoked_at IS NULL;

-- Only platform memberships may live outside an institute.
ALTER TABLE "memberships" ADD CONSTRAINT memberships_institute_required
  CHECK (scope_type = 'platform' OR institute_id IS NOT NULL);
