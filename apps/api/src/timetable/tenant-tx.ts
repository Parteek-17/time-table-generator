import type { TxClient } from '@slotwise/db';
import type { PrismaService } from '../db/prisma.service';

/**
 * `prisma.tenant()` with a longer limit, for writes of a whole version's slots (copy, publish,
 * undo). Same RLS settings as withTenant(); goes away when INT adds a timeout option there
 * (requests/2026-10-27-p2t-tenant-transaction-timeout.md).
 */
export function tenantLong<T>(
  prisma: PrismaService,
  ctx: { instituteId: string; userId: string },
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.institute_id', ${ctx.instituteId}, true),
                                set_config('app.user_id', ${ctx.userId}, true)`;
      return fn(tx);
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}
