import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { TxClient } from '@slotwise/db';
import type { InvigilatorDto, SetUnavailableInput } from '@slotwise/shared/exams';
import type { Tenant } from '../../common/request-context';
import { PrismaService } from '../../db/prisma.service';
import { invigilatorPool } from '../seating/invigilators';

const NO_SESSION = 'We could not find this exam session.';

/** Who can invigilate a session, and marking faculty unavailable for it. */
@Injectable()
export class InvigilationService {
  constructor(private readonly prisma: PrismaService) {}

  private tx<T>(tenant: Tenant, fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return this.prisma.tenant({ instituteId: tenant.institute.id, userId: tenant.user.id }, fn);
  }

  private async session(tx: TxClient, sessionId: string) {
    const session = await tx.examSession.findFirst({
      where: { id: sessionId, exam: { deletedAt: null } },
      include: { exam: true, papers: { include: { course: { select: { code: true } } } } },
    });
    if (!session) throw new NotFoundException(NO_SESSION);
    return session;
  }

  invigilators(tenant: Tenant, sessionId: string): Promise<InvigilatorDto[]> {
    return this.tx(tenant, async (tx) => {
      const session = await this.session(tx, sessionId);
      const code = new Map(session.papers.map((p) => [p.id, p.course.code]));
      const pool = await invigilatorPool(
        tx,
        { id: session.id, examId: session.examId, termId: session.exam.termId },
        session.papers,
      );
      return pool.map((f) => ({
        facultyId: f.id,
        name: f.name,
        available: f.available,
        teaches: f.teachesPaperIds.map((id) => code.get(id) ?? '').sort(),
        dutiesSoFar: f.dutiesSoFar,
      }));
    });
  }

  setUnavailable(tenant: Tenant, sessionId: string, input: SetUnavailableInput): Promise<void> {
    return this.tx(tenant, async (tx) => {
      await this.session(tx, sessionId);
      const ids = [...new Set(input.facultyIds)];
      const found = await tx.faculty.count({ where: { id: { in: ids }, deletedAt: null } });
      if (found !== ids.length) {
        throw new BadRequestException(
          'Some of these teachers no longer exist. Reload and try again.',
        );
      }
      await tx.invigilatorUnavailability.deleteMany({ where: { sessionId } });
      await tx.invigilatorUnavailability.createMany({
        data: ids.map((facultyId) => ({
          instituteId: tenant.institute.id,
          sessionId,
          facultyId,
        })),
      });
    });
  }
}
