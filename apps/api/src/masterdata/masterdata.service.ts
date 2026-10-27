import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, type TxClient } from '@slotwise/db';
import {
  can,
  type Action,
  type ListQuery,
  type Resource,
  type ResourceType,
} from '@slotwise/shared';
import { parseEvent, type EventNameV1 } from '@slotwise/shared/contracts';
import { AuditService, type AuditAction } from '../audit/audit.service';
import type { Tenant } from '../common/request-context';
import { PrismaService } from '../db/prisma.service';
import { changes, toDto, type BaseRow, type EntityContext, type EntityDef } from './entity';

const NOT_ALLOWED = 'You don’t have permission to change this. Ask your institute admin.';

/**
 * Every master-data write goes through here: one tenant transaction that checks can(),
 * validates references, writes, and records an audit entry (ADR 0007, ADR 0008).
 */
@Injectable()
export class MasterDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  /** Runs fn in a tenant transaction; maps database constraint errors to plain messages. */
  async run<T>(
    tenant: Tenant,
    fn: (ctx: EntityContext) => Promise<T>,
    duplicate: (target: string) => string = () => 'This already exists.',
  ): Promise<T> {
    const pending: { name: EventNameV1; payload: unknown }[] = [];
    let result: T;
    try {
      result = await this.prisma.tenant(
        { instituteId: tenant.institute.id, userId: tenant.user.id },
        (tx) =>
          fn({
            tx,
            tenant,
            // Validated now, so a bad payload fails the write instead of the listener.
            emit: (name, payload) => pending.push({ name, payload: parseEvent(name, payload) }),
          }),
      );
    } catch (error) {
      throw this.friendly(error, duplicate);
    }
    for (const e of pending) this.events.emit(e.name, e.payload);
    return result;
  }

  /** The can() resource for something owned by `departmentId` (null = institute). */
  resource(
    tenant: Tenant,
    type: ResourceType,
    departmentId: string | null,
    extra: Partial<Resource> = {},
  ): Resource {
    return {
      type,
      instituteId: tenant.institute.id,
      universityId: tenant.institute.parentUniversityId,
      departmentId,
      ...extra,
    };
  }

  assertCan(tenant: Tenant, action: Action, resource: Resource, message = NOT_ALLOWED): void {
    if (!can(tenant.authUser, action, resource)) throw new ForbiddenException(message);
  }

  audit(
    ctx: EntityContext,
    action: AuditAction,
    targetType: string,
    targetId: string | null,
    metadata: Prisma.InputJsonObject = {},
  ): Promise<void> {
    return this.auditService.record(ctx.tx, {
      instituteId: ctx.tenant.institute.id,
      actorUserId: ctx.tenant.user.id,
      action,
      targetType,
      targetId,
      metadata,
    });
  }

  // ---- Generic CRUD ---------------------------------------------------------------------

  list<I, R extends BaseRow, D>(
    def: EntityDef<I, R, D>,
    tenant: Tenant,
    query: ListQuery,
  ): Promise<D[]> {
    return this.run(tenant, async ({ tx }) => {
      const rows: R[] = await def.model(tx).findMany({
        where: {
          ...(query.includeArchived ? {} : { deletedAt: null }),
          ...(def.listWhere?.(query) ?? {}),
        },
        include: def.include,
        orderBy: def.orderBy,
      });
      return rows.map((r) => toDto(def, r));
    });
  }

  get<I, R extends BaseRow, D>(def: EntityDef<I, R, D>, tenant: Tenant, id: string): Promise<D> {
    return this.run(tenant, async ({ tx }) => toDto(def, await this.find(def, tx, id, true)));
  }

  create<I, R extends BaseRow, D>(def: EntityDef<I, R, D>, tenant: Tenant, input: I): Promise<D> {
    return this.run(tenant, (ctx) => this.createIn(ctx, def, input), def.duplicate);
  }

  update<I, R extends BaseRow, D>(
    def: EntityDef<I, R, D>,
    tenant: Tenant,
    id: string,
    input: I,
  ): Promise<D> {
    return this.run(tenant, (ctx) => this.updateIn(ctx, def, id, input), def.duplicate);
  }

  /** create() inside a transaction the caller already holds (imports commit many rows). */
  async createIn<I, R extends BaseRow, D>(
    ctx: EntityContext,
    def: EntityDef<I, R, D>,
    input: I,
  ): Promise<D> {
    const { tenant } = ctx;
    const dept = await def.departmentOf(ctx, input);
    this.assertCan(tenant, def.manage, this.resource(tenant, def.resourceType, dept));
    const data = await def.toData(ctx, input);
    const created: R = await def
      .model(ctx.tx)
      .create({ data: { ...data, instituteId: tenant.institute.id } });
    await def.afterWrite?.(ctx, created, input, true);
    const row = await this.find(def, ctx.tx, created.id, false);
    await this.audit(ctx, `${def.name}.created`, def.name, row.id, {
      after: json(def.toInput(row)),
    });
    return toDto(def, row);
  }

  /** update() inside a transaction the caller already holds. */
  async updateIn<I, R extends BaseRow, D>(
    ctx: EntityContext,
    def: EntityDef<I, R, D>,
    id: string,
    input: I,
  ): Promise<D> {
    const { tenant } = ctx;
    const existing = await this.find(def, ctx.tx, id, false);
    const before = def.toInput(existing);
    // Moving something between departments needs rights on both.
    const [oldDept, newDept] = await Promise.all([
      def.departmentOf(ctx, before, existing),
      def.departmentOf(ctx, input, existing),
    ]);
    this.assertCan(tenant, def.manage, this.resource(tenant, def.resourceType, oldDept));
    this.assertCan(tenant, def.manage, this.resource(tenant, def.resourceType, newDept));
    const data = await def.toData(ctx, input, existing);
    const updated: R = await def.model(ctx.tx).update({ where: { id }, data });
    await def.afterWrite?.(ctx, updated, input, false, existing);
    const row = await this.find(def, ctx.tx, id, false);
    const diff = changes(json(before), json(def.toInput(row)));
    await this.audit(ctx, `${def.name}.updated`, def.name, id, { changes: json(diff) });
    return toDto(def, row);
  }

  /** Soft delete. Undo with restore (CLAUDE.md "Undo instead of confirm"). */
  archive<I, R extends BaseRow, D>(
    def: EntityDef<I, R, D>,
    tenant: Tenant,
    id: string,
  ): Promise<void> {
    return this.run(tenant, async (ctx) => {
      const row = await this.find(def, ctx.tx, id, false);
      const dept = await def.departmentOf(ctx, def.toInput(row), row);
      this.assertCan(tenant, def.manage, this.resource(tenant, def.resourceType, dept));
      await def.model(ctx.tx).update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit(ctx, `${def.name}.archived`, def.name, id);
    });
  }

  restore<I, R extends BaseRow, D>(
    def: EntityDef<I, R, D>,
    tenant: Tenant,
    id: string,
  ): Promise<D> {
    return this.run(
      tenant,
      async (ctx) => {
        const row = await this.find(def, ctx.tx, id, true);
        if (!row.deletedAt) return toDto(def, row);
        const dept = await def.departmentOf(ctx, def.toInput(row), row);
        this.assertCan(tenant, def.manage, this.resource(tenant, def.resourceType, dept));
        const restored: R = await def
          .model(ctx.tx)
          .update({ where: { id }, data: { deletedAt: null }, include: def.include });
        await this.audit(ctx, `${def.name}.restored`, def.name, id);
        return toDto(def, restored);
      },
      def.duplicate,
    );
  }

  private async find<I, R extends BaseRow, D>(
    def: EntityDef<I, R, D>,
    tx: TxClient,
    id: string,
    includeArchived: boolean,
  ): Promise<R> {
    const row: R | null = await def.model(tx).findFirst({
      where: { id, ...(includeArchived ? {} : { deletedAt: null }) },
      include: def.include,
    });
    if (!row) throw new NotFoundException('We could not find this. It may have been archived.');
    return row;
  }

  /** Database constraint errors as plain messages (also used by imports). */
  friendly(error: unknown, duplicate: (target: string) => string): unknown {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return error;
    if (error.code === 'P2002') {
      const target = error.meta?.target;
      return new ConflictException(
        duplicate(Array.isArray(target) ? target.join(',') : String(target ?? '')),
      );
    }
    if (error.code === 'P2003') {
      return new BadRequestException(
        'Something this refers to no longer exists. Reload and try again.',
      );
    }
    if (error.code === 'P2004' || /violates check constraint/.test(error.message)) {
      return new BadRequestException('Some values are not allowed. Check the form and try again.');
    }
    return error;
  }
}

/** Plain JSON for the audit log (drops undefined, keeps null). */
function json<T>(value: T): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonObject;
}
