#!/usr/bin/env node
// Creates every stream's database (scripts/lib/streams.mjs) in an already-running Postgres,
// using the owner connection from packages/db/.env. Safe to re-run. New volumes get them from
// infra/postgres/init/02-stream-databases.sql instead.
//
//   pnpm db:create-stream-dbs
//
// Afterwards, in each stream's worktree: pnpm db:deploy && pnpm db:seed (the migrations add
// the grants for the slotwise_app role).
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { STREAM_DATABASES } from './lib/streams.mjs';

const root = join(import.meta.dirname, '..');
try {
  process.loadEnvFile(join(root, 'packages/db/.env'));
} catch {
  // Use the environment.
}
const ownerUrl = process.env.OWNER_DATABASE_URL;
if (!ownerUrl) {
  console.error('create-stream-dbs: OWNER_DATABASE_URL is not set (packages/db/.env).');
  process.exit(1);
}

const require = createRequire(join(root, 'packages/db/package.json'));
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasourceUrl: ownerUrl });

try {
  const rows = await prisma.$queryRawUnsafe('SELECT datname FROM pg_database');
  const existing = new Set(rows.map((r) => r.datname));
  for (const db of STREAM_DATABASES) {
    if (existing.has(db)) {
      console.log(`${db}: exists`);
      continue;
    }
    // Names come from the fixed list in scripts/lib/streams.mjs, never from input.
    await prisma.$executeRawUnsafe(`CREATE DATABASE "${db}"`);
    console.log(`${db}: created`);
  }
} finally {
  await prisma.$disconnect();
}
