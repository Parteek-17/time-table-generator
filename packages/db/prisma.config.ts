/**
 * Prisma CLI configuration. The schema is a folder (one .prisma file per stream, see
 * docs/coordination/OWNERSHIP.md); migrations stay in prisma/migrations.
 */
import { defineConfig } from 'prisma/config';

// With a config file Prisma no longer loads .env itself.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file: rely on the environment (CI, hosted DBs).
}

export default defineConfig({
  schema: 'prisma/schema',
  migrations: { path: 'prisma/migrations' },
});
