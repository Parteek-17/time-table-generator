#!/usr/bin/env node
// Writes .env.local overrides for one stream in the current worktree, so its web, API,
// solver, Postgres database and Redis database don't clash with other streams.
//
//   node scripts/stream-env.mjs P2T
//
// Reads the worktree's .env files for credentials and changes only ports, database names and
// the Redis index. Never prints values (they may hold secrets).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv, renderEnv, streamConfig, streamEnvFiles } from './lib/streams.mjs';

const root = join(import.meta.dirname, '..');
let config;
try {
  config = streamConfig(process.argv[2]);
} catch (error) {
  console.error(`stream-env: ${error.message}\nUsage: node scripts/stream-env.mjs <STREAM>`);
  process.exit(1);
}

const env = {};
for (const file of ['apps/api/.env', 'apps/web/.env', 'packages/db/.env']) {
  const path = join(root, file);
  if (existsSync(path)) env[file] = parseEnv(readFileSync(path, 'utf8'));
  else console.warn(`stream-env: ${file} is missing (pnpm install creates it from .env.example).`);
}

for (const [file, content] of Object.entries(streamEnvFiles(config, env))) {
  writeFileSync(join(root, file), renderEnv(content));
  console.log(`wrote ${file} (${Object.keys(content.values).join(', ')})`);
}

console.log(`\nStream ${config.id}:`);
if (config.web) console.log(`  web     http://demo.localhost:${config.web}`);
if (config.api) console.log(`  api     http://localhost:${config.api}/health`);
if (config.solver) console.log(`  solver  http://localhost:${config.solver}/health`);
if (config.db) {
  console.log(`  db      ${config.db}, redis db ${config.redis}`);
  console.log('\nFirst time: pnpm db:create-stream-dbs, then pnpm db:deploy && pnpm db:seed here.');
}
