-- Dev only. Runs once, when the Postgres volume is first created (after 01-app-role.sql).
-- One database per parallel stream (scripts/lib/streams.mjs); the migrations add the grants
-- for slotwise_app in each. For a volume that already exists: pnpm db:create-stream-dbs.
CREATE DATABASE slotwise_p1;
CREATE DATABASE slotwise_ui;
CREATE DATABASE slotwise_p2t;
CREATE DATABASE slotwise_p4;
CREATE DATABASE slotwise_p5;
CREATE DATABASE slotwise_p6;
CREATE DATABASE slotwise_p7;
