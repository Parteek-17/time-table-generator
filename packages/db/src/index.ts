import { Prisma, PrismaClient } from '@prisma/client';

export { Prisma, PrismaClient };
export type {
  AuditLog,
  Department,
  Institute,
  InstituteType,
  Invite,
  Membership,
  Role as DbRole,
  ScopeType as DbScopeType,
  User,
} from '@prisma/client';

export type TxClient = Prisma.TransactionClient;

/** Who and where a database call is for. Drives row-level security. */
export interface TenantContext {
  /** Institute the request is about; null means no tenant rows are visible. */
  instituteId: string | null;
  /** Signed-in user; lets them read their own memberships in other institutes. */
  userId: string | null;
}

/**
 * Runs fn inside one transaction with the RLS settings applied.
 * set_config(..., true) is the parameterised form of SET LOCAL: it lasts until the
 * transaction ends, so a pooled connection never leaks one request's tenant into another.
 */
export async function withTenant<T>(
  prisma: PrismaClient,
  ctx: TenantContext,
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.institute_id', ${ctx.instituteId ?? ''}, true),
                              set_config('app.user_id', ${ctx.userId ?? ''}, true)`;
    return fn(tx);
  });
}

export function createPrismaClient(url?: string): PrismaClient {
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
}
