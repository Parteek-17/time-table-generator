import 'server-only';
import { createPrismaClient, type PrismaClient } from '@slotwise/db';
import { env } from './env';

// Reuse one client across hot reloads in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Used only by the Auth.js adapter (users, accounts, sessions). Everything else goes via the API. */
export function prisma(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient(env().DATABASE_URL);
  return globalForPrisma.prisma;
}
