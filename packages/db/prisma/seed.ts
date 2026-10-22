/**
 * Seed runner (INT). Runs P1's seed first (the "Demo Institute of Engineering"), then each
 * stream's `seed/<stream>.ts` that exists, in merge order. A stream seed exports
 * `default async function (prisma: PrismaClient): Promise<void>`, must be safe to re-run and
 * may assume P1's demo institute exists. Fictional data only (CLAUDE.md "Things to avoid").
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '../src/index';
import seedP1 from './seed/p1';

type StreamSeed = (prisma: PrismaClient) => Promise<void>;

/** Merge order (docs/coordination/MERGE-ORDER.md), after P1. */
const STREAM_SEEDS = ['p2t', 'p4', 'p6', 'p5', 'p7'] as const;

// .env.local (stream worktree overrides, scripts/stream-env.mjs) wins over .env.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // No .env file: rely on the environment (CI, hosted DBs).
  }
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await seedP1(prisma);
  for (const stream of STREAM_SEEDS) {
    if (!existsSync(join(__dirname, 'seed', `${stream}.ts`))) continue;
    const mod = (await import(`./seed/${stream}`)) as { default: StreamSeed };
    console.log(`Seeding ${stream}…`);
    await mod.default(prisma);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
