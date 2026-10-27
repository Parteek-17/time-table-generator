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

export { buildSampleInstitute, type SampleSummary } from './sample/build';
export { SAMPLE_INSTITUTE, PLANNED_GAPS } from './sample/data';
export { loadReadinessSnapshot } from './readiness-snapshot';
export { purgeInstitute, TENANT_TABLES_DELETE_ORDER } from './purge';

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
  /** Prisma's limits, in ms (defaults: 5000 and 2000). Raise `timeout` for writes of hundreds of rows. */
  options?: TenantTxOptions,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.institute_id', ${ctx.instituteId ?? ''}, true),
                              set_config('app.user_id', ${ctx.userId ?? ''}, true)`;
    return fn(tx);
  }, options);
}

export type TenantTxOptions = { timeout?: number; maxWait?: number };

export function createPrismaClient(url?: string): PrismaClient {
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
}
