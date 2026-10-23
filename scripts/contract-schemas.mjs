#!/usr/bin/env node
// Writes services/solver/contracts/*.schema.json from the zod contracts in packages/shared.
// Run after building packages/shared: `pnpm contracts:schemas`. A shared test fails when the
// committed files are out of date.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const { solverJsonSchemas } = require(join(root, 'packages/shared/dist/contracts/json-schema.js'));

const out = join(root, 'services/solver/contracts');
mkdirSync(out, { recursive: true });
for (const [name, schema] of Object.entries(solverJsonSchemas())) {
  writeFileSync(join(out, name), `${JSON.stringify(schema, null, 2)}\n`);
  console.log(`wrote services/solver/contracts/${name}`);
}
