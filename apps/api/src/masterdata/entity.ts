/**
 * Describes one master-data entity (programme, room, …) for the generic service and
 * controller in this folder. Each entity says how to validate, who owns it (for can()),
 * which referenced ids must exist in this institute, and how to map rows to DTOs.
 */
import { BadRequestException } from '@nestjs/common';
import type { TxClient } from '@slotwise/db';
import type { Action, ListQuery, ResourceType } from '@slotwise/shared';
import type { z } from 'zod';
import type { Tenant } from '../common/request-context';

/**
 * The few Prisma delegate calls the generic service uses. Prisma's delegates have
 * per-model argument types that cannot be expressed generically, hence `any` here only.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ModelDelegate {
  findFirst(args: any): Promise<any>;
  findMany(args: any): Promise<any[]>;
  create(args: any): Promise<any>;
  update(args: any): Promise<any>;
  count(args?: any): Promise<number>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Every master-data row has these. */
export interface BaseRow {
  id: string;
  deletedAt: Date | null;
}

export interface EntityContext {
  tx: TxClient;
  tenant: Tenant;
}

export interface EntityDef<Input, Row extends BaseRow, Dto> {
  /** Audit target type and log name, e.g. "programme". */
  name: string;
  /** Route, e.g. "programmes". */
  path: string;
  /** Action needed to create, edit, archive or restore. Reads need masterdata.view. */
  manage: Action;
  resourceType: ResourceType;
  schema: z.ZodType<Input, unknown>;
  model(tx: TxClient): ModelDelegate;
  /** Prisma include for reads (relations needed by toInput/extras). */
  include?: object;
  orderBy: object | object[];
  /** Extra list filters from the query string. */
  listWhere?(query: ListQuery): object;
  /**
   * Department that owns the values (null = institute-owned). For updates it is called for
   * the stored row (via toInput) and for the new values; the user needs rights on both.
   */
  departmentOf(ctx: EntityContext, values: Input, existing?: Row): Promise<string | null>;
  /** Checks referenced ids belong to this institute, then maps input to Prisma data. */
  toData(ctx: EntityContext, input: Input, existing?: Row): Promise<Record<string, unknown>>;
  /** Writes child or join rows (course branches, sub-groups, bell periods). */
  afterWrite?(ctx: EntityContext, row: Row, input: Input, created: boolean): Promise<void>;
  /** The editable values of a stored row (also the base of its DTO). */
  toInput(row: Row): Input;
  /** Display-only extras for the DTO (codes, counts). */
  extras?(row: Row): object;
  /** Message for a unique-constraint clash; `target` names the fields or index. */
  duplicate(target: string): string;
  /** Type only: ties the definition to the DTO its routes return. Never set. */
  readonly _dto?: Dto;
}

/** Same as Dto: the editable values, id, archivedAt and extras. */
export function toDto<Input, Row extends BaseRow, Dto>(
  def: EntityDef<Input, Row, Dto>,
  row: Row,
): Dto {
  return {
    ...def.toInput(row),
    id: row.id,
    archivedAt: row.deletedAt?.toISOString() ?? null,
    ...(def.extras?.(row) ?? {}),
  } as Dto;
}

export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const isoOrNull = (d: Date | null) => (d ? iso(d) : null);
export const date = (s: string) => new Date(`${s}T00:00:00.000Z`);
export const dateOrNull = (s: string | null) => (s ? date(s) : null);

type RefCheck = readonly [
  field: string,
  model: ModelDelegate,
  id: string | null | undefined,
  message: string,
  extraWhere?: object,
];

/**
 * Every referenced id must be a live row of this institute. Row-level security hides other
 * institutes' rows, so their ids fail here too (ADR 0007). Reports all bad fields at once.
 */
export async function requireRefs(checks: readonly RefCheck[]): Promise<void> {
  const fieldErrors: Record<string, string[]> = {};
  for (const [field, model, id, message, extraWhere] of checks) {
    if (!id) continue;
    const found = await model.findFirst({
      where: { id, deletedAt: null, ...(extraWhere ?? {}) },
      select: { id: true },
    });
    if (!found) (fieldErrors[field] ??= []).push(message);
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw new BadRequestException({
      statusCode: 400,
      message: 'Please check the highlighted fields.',
      fieldErrors,
    });
  }
}

/** Throws a 400 for one field, in the same shape as ZodPipe. */
export function fieldError(field: string, message: string): never {
  throw new BadRequestException({
    statusCode: 400,
    message: 'Please check the highlighted fields.',
    fieldErrors: { [field]: [message] },
  });
}

/** Scalar fields that differ between two values, for the audit log. */
export function changes(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      diff[key] = { from: before[key] ?? null, to: after[key] ?? null };
    }
  }
  return diff;
}
