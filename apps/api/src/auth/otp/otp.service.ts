import { randomInt } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Institute, TxClient } from '@slotwise/db';
import {
  codeMatches,
  hashCode,
  maskEmail,
  OTP_RULES,
  type OtpRequestResult,
  type OtpVerifyResult,
} from '@slotwise/shared/portal';
import { AuditService } from '../../audit/audit.service';
import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../../db/prisma.service';
import { MailService } from '../../mail/mail.service';
import { otpEmail } from './otp-email';

const MINUTE = 60_000;

/** A plain-language refusal; thrown after the transaction so a wrong try is still counted. */
class OtpProblem {
  constructor(
    readonly status: HttpStatus,
    readonly message: string,
  ) {}
}

function raise(problem: OtpProblem): never {
  throw new HttpException({ statusCode: problem.status, message: problem.message }, problem.status);
}

/**
 * Roll number + one-time code for students (CLAUDE.md "Access and login"). Codes go to the
 * email on the student's record; only a hash is stored. Limits: 3 codes per 15 minutes,
 * 10 minutes each, 5 wrong tries.
 */
@Injectable()
export class OtpService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async request(
    institute: Institute,
    rollNumber: string,
    now = new Date(),
  ): Promise<OtpRequestResult> {
    const code = String(randomInt(0, 10 ** OTP_RULES.digits)).padStart(OTP_RULES.digits, '0');
    const sent = await this.prisma.tenant(
      { instituteId: institute.id, userId: null },
      async (tx) => {
        const student = await this.findStudent(tx, institute, rollNumber);
        if (!student.email) {
          throw new UnprocessableEntityException(
            'Your record has no email address yet. Ask your class coordinator to add it, then try again.',
          );
        }
        const recent = await tx.portalLoginCode.count({
          where: {
            studentId: student.id,
            createdAt: { gt: new Date(now.getTime() - OTP_RULES.windowMinutes * MINUTE) },
          },
        });
        if (recent >= OTP_RULES.maxSends) {
          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              message: `You asked for ${OTP_RULES.maxSends} codes in the last ${OTP_RULES.windowMinutes} minutes. Use the newest one, or wait a few minutes and try again.`,
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        // Only the newest code works.
        await tx.portalLoginCode.updateMany({
          where: { studentId: student.id, usedAt: null },
          data: { usedAt: now },
        });
        await tx.portalLoginCode.create({
          data: {
            instituteId: institute.id,
            studentId: student.id,
            codeHash: hashCode(code, this.env.API_JWT_SECRET),
            expiresAt: new Date(now.getTime() + OTP_RULES.ttlMinutes * MINUTE),
            createdAt: now,
          },
        });
        return { email: student.email.toLowerCase(), name: student.name };
      },
    );

    const delivered = await this.mail.send(
      otpEmail({
        to: sent.email,
        name: sent.name,
        instituteName: institute.name,
        code,
        minutes: OTP_RULES.ttlMinutes,
      }),
    );
    if (!delivered) {
      throw new ServiceUnavailableException(
        'We couldn’t send the email just now. Please try again in a minute.',
      );
    }
    return { maskedEmail: maskEmail(sent.email), expiresInMinutes: OTP_RULES.ttlMinutes };
  }

  /**
   * Checks the code. On success the student has a login (user with their record's email) and
   * a student membership for their section, and the code is spent.
   */
  async verify(
    institute: Institute,
    rollNumber: string,
    code: string,
    now = new Date(),
  ): Promise<OtpVerifyResult> {
    const outcome = await this.prisma.tenant(
      { instituteId: institute.id, userId: null },
      async (tx): Promise<OtpVerifyResult | OtpProblem> => {
        const student = await this.findStudent(tx, institute, rollNumber);
        const latest = await tx.portalLoginCode.findFirst({
          where: { studentId: student.id, usedAt: null, expiresAt: { gt: now } },
          orderBy: { createdAt: 'desc' },
        });
        if (!latest || !student.email) {
          return new OtpProblem(
            HttpStatus.BAD_REQUEST,
            'This code has expired or was already used. Ask for a new code.',
          );
        }
        if (latest.attempts >= OTP_RULES.maxAttempts) {
          return new OtpProblem(
            HttpStatus.TOO_MANY_REQUESTS,
            'Too many wrong tries for this code. Ask for a new code.',
          );
        }
        if (!codeMatches(code, latest.codeHash, this.env.API_JWT_SECRET)) {
          const attempts = latest.attempts + 1;
          await tx.portalLoginCode.update({ where: { id: latest.id }, data: { attempts } });
          const left = OTP_RULES.maxAttempts - attempts;
          return new OtpProblem(
            HttpStatus.BAD_REQUEST,
            left > 0
              ? `That code isn’t right. Check the email and try again (${left} ${left === 1 ? 'try' : 'tries'} left).`
              : 'That code isn’t right, and this code no longer works. Ask for a new code.',
          );
        }
        await tx.portalLoginCode.update({ where: { id: latest.id }, data: { usedAt: now } });

        const email = student.email.toLowerCase();
        const user = await tx.user.upsert({
          where: { email },
          update: {},
          create: { email, name: student.name, emailVerified: now },
        });
        // A student reads their section's timetable; the section scope is where they belong.
        const scope = student.sectionId
          ? { scopeType: 'section' as const, scopeId: student.sectionId }
          : { scopeType: 'institute' as const, scopeId: institute.id };
        const existing = await tx.membership.findFirst({
          where: { userId: user.id, role: 'student', instituteId: institute.id, revokedAt: null },
        });
        if (!existing) {
          const membership = await tx.membership.create({
            data: { userId: user.id, role: 'student', instituteId: institute.id, ...scope },
          });
          await this.audit.record(tx, {
            instituteId: institute.id,
            actorUserId: user.id,
            action: 'membership.created_by_code',
            targetType: 'membership',
            targetId: membership.id,
            metadata: { studentId: student.id },
          });
        }
        return { email };
      },
    );
    if (outcome instanceof OtpProblem) raise(outcome);
    return outcome;
  }

  private async findStudent(tx: TxClient, institute: Institute, rollNumber: string) {
    const roll = rollNumber.trim();
    const student = await tx.student.findFirst({
      where: {
        status: 'active',
        deletedAt: null,
        OR: [
          { classRollNo: { equals: roll, mode: 'insensitive' } },
          { universityRollNo: { equals: roll, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, email: true, sectionId: true },
    });
    if (!student) {
      throw new NotFoundException(
        `We couldn’t find roll number ${roll} at ${institute.name}. Check it, or ask your class coordinator.`,
      );
    }
    return student;
  }
}
