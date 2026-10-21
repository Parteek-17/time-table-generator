import { Injectable } from '@nestjs/common';
import type { Prisma, TxClient } from '@slotwise/db';

export type AuditAction =
  | 'invite.created'
  | 'invite.cancelled'
  | 'invite.accepted'
  | 'membership.revoked'
  | 'membership.restored';

export interface AuditEntry {
  instituteId: string;
  actorUserId: string | null;
  action: AuditAction;
  targetType: 'invite' | 'membership';
  targetId: string;
  metadata?: Prisma.InputJsonObject;
}

@Injectable()
export class AuditService {
  /** Writes inside the caller's transaction so the entry commits (or rolls back) with the change. */
  async record(tx: TxClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({ data: { ...entry, metadata: entry.metadata ?? {} } });
  }
}
