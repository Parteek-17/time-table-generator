-- Dev and CI only. Runs once, when the Postgres volume is first created.
-- The restricted login used by the API and web app: not a superuser, cannot bypass
-- row-level security, does not own the tables. Grants are added by the migrations.
-- Production: create this role with a strong password instead (docs/deployment.md).
CREATE ROLE slotwise_app LOGIN PASSWORD 'slotwise_app' NOSUPERUSER NOBYPASSRLS;
