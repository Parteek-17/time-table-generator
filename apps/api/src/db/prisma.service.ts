import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  PrismaClient,
  withTenant,
  type TenantContext,
  type TenantTxOptions,
  type TxClient,
} from '@slotwise/db';
import { ENV, type Env } from '../config/env';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(ENV) env: Env) {
    super({ datasources: { db: { url: env.DATABASE_URL } } });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.assertRestrictedRole();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Runs fn in one transaction with row-level security set for this tenant. */
  tenant<T>(
    ctx: TenantContext,
    fn: (tx: TxClient) => Promise<T>,
    options?: TenantTxOptions,
  ): Promise<T> {
    return withTenant(this, ctx, fn, options);
  }

  /**
   * Row-level security only protects us if the API's login is restricted. Refuse to start
   * when it is a superuser, can bypass RLS, or owns the tenant tables.
   */
  private async assertRestrictedRole(): Promise<void> {
    const [row] = await this.$queryRaw<
      { role: string; rolsuper: boolean; rolbypassrls: boolean; owns: boolean }[]
    >`SELECT current_user AS role, r.rolsuper, r.rolbypassrls,
             EXISTS (SELECT 1 FROM pg_tables
                      WHERE schemaname = 'public' AND tablename = 'memberships'
                        AND tableowner = current_user) AS owns
        FROM pg_roles r WHERE r.rolname = current_user`;
    if (!row || row.rolsuper || row.rolbypassrls || row.owns) {
      throw new Error(
        `The API database user "${row?.role ?? 'unknown'}" is not restricted by row-level security. ` +
          'Set DATABASE_URL to the slotwise_app role (see docs/deployment.md).',
      );
    }
    this.logger.log(`Connected as restricted role "${row.role}"`);
  }
}
