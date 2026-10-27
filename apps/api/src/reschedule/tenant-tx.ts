import type { TxClient } from '@slotwise/db';
import type { Tenant } from '../common/request-context';
import type { PrismaService } from '../db/prisma.service';

/**
 * `prisma.tenant()` with a longer limit: a week-long holiday writes hundreds of cancellations,
 * and this laptop-class hardware misses Prisma's 5 s default. Same RLS settings as
 * withTenant(); goes away when INT's timeout option for it is merged
 * (requests/done/2026-10-27-p2t-tenant-transaction-timeout.md).
 */
export function tenantTx<T>(
  prisma: PrismaService,
  tenant: Tenant,
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.institute_id', ${tenant.institute.id}, true),
                                set_config('app.user_id', ${tenant.user.id}, true)`;
      return fn(tx);
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}
