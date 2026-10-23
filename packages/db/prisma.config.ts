/**
 * Prisma CLI configuration. The schema is a folder (one .prisma file per stream, see
 * docs/coordination/OWNERSHIP.md); migrations stay in prisma/migrations.
 */
import { defineConfig } from 'prisma/config';

// With a config file Prisma no longer loads .env itself.
// .env.local (stream worktree overrides, scripts/stream-env.mjs) wins over .env.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // No .env file: rely on the environment (CI, hosted DBs).
  }
}

export default defineConfig({
  schema: 'prisma/schema',
  migrations: { path: 'prisma/migrations' },
});
