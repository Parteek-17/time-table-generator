/**
 * Loads .env.local (stream worktree overrides, scripts/stream-env.mjs) and then .env. Import it
 * FIRST, before anything that imports @prisma/client: the generated client loads
 * packages/db/.env on import, and process.loadEnvFile never overrides a variable that is already
 * set, so the main database's URLs would win over the stream's.
 */
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // No such file: rely on the environment (CI, hosted DBs).
  }
}

export {};
