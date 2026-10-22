import { Injectable } from '@nestjs/common';
import type { Prisma, TxClient } from '@slotwise/db';

/**
 * Phase 0 actions, plus `<entity>.<created|updated|archived|restored>` for master data and
 * a few named actions (e.g. `batches.promoted`, `holidays.pasted`).
 */
export type AuditAction =
  | 'invite.created'
  | 'invite.cancelled'
  | 'invite.accepted'
  | 'membership.revoked'
  | 'membership.restored'
  | `${string}.${string}`;

export interface AuditEntry {
  instituteId: string;
  actorUserId: string | null;
  action: AuditAction;
  /** e.g. invite, membership, programme, section, faculty */
  targetType: string;
  targetId: string | null;
  metadata?: Prisma.InputJsonObject;
}

@Injectable()
export class AuditService {
  /** Writes inside the caller's transaction so the entry commits (or rolls back) with the change. */
  async record(tx: TxClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({ data: { ...entry, metadata: entry.metadata ?? {} } });
  }
}
