import type { TxClient } from '@slotwise/db';
import type { PrismaService } from '../db/prisma.service';

/**
 * `prisma.tenant()` with a longer limit, for writes of a whole version's slots (copy, publish,
 * undo): ~400 rows can take over Prisma's default 5 s on a slow host.
 */
export function tenantLong<T>(
  prisma: PrismaService,
  ctx: { instituteId: string; userId: string },
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return prisma.tenant(ctx, fn, { timeout: 30_000, maxWait: 10_000 });
}
