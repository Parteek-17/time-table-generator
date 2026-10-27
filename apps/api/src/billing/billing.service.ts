import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma, TxClient } from '@slotwise/db';
import {
  checkLimit,
  DEFAULT_PLAN,
  isPlanCode,
  PLANS,
  trialDaysLeft,
  trialEndDate,
  usageReport,
  type LimitKind,
  type Plan,
  type PlanCode,
  type PlanStatusDto,
  type SetPlanInput,
} from '@slotwise/shared/platform';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../db/prisma.service';

/** Today's date (YYYY-MM-DD) in the institute's time zone. */
export function todayIn(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
}

type InstituteSubscription = Prisma.InstituteSubscriptionGetPayload<object>;

const toDate = (day: string | null) => (day ? new Date(`${day}T00:00:00Z`) : null);
const fromDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Unknown codes in the table (a plan since removed) count as the default plan. */
export function planOf(sub: Pick<InstituteSubscription, 'planCode'> | null): Plan {
  return PLANS[sub && isPlanCode(sub.planCode) ? sub.planCode : DEFAULT_PLAN];
}

/**
 * Institutes' plans and limits (docs/adr/0090-plans-and-limits.md). Every method takes the
 * caller's tenant transaction, so it works for institute routes and platform routes alike.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Gives a new institute the default plan. Keeps an existing row (events can repeat). */
  async startDefaultPlan(instituteId: string, timezone: string): Promise<void> {
    const plan = PLANS[DEFAULT_PLAN];
    await this.prisma.tenant({ instituteId, userId: null }, (tx) =>
      tx.instituteSubscription.upsert({
        where: { instituteId },
        update: {},
        create: {
          instituteId,
          planCode: plan.code,
          trialEndsOn: toDate(trialEndDate(plan, todayIn(timezone))),
        },
      }),
    );
  }

  async setPlan(
    tx: TxClient,
    institute: { id: string; timezone: string },
    input: SetPlanInput,
    actorUserId: string,
  ): Promise<InstituteSubscription> {
    const plan = PLANS[input.planCode as PlanCode];
    const trialEndsOn =
      input.trialEndsOn === undefined
        ? trialEndDate(plan, todayIn(institute.timezone))
        : input.trialEndsOn;
    const before = await tx.instituteSubscription.findUnique({
      where: { instituteId: institute.id },
    });
    const data = { planCode: plan.code, trialEndsOn: toDate(trialEndsOn) };
    const sub = await tx.instituteSubscription.upsert({
      where: { instituteId: institute.id },
      update: data,
      create: { instituteId: institute.id, ...data },
    });
    await this.audit.record(tx, {
      instituteId: institute.id,
      actorUserId,
      action: 'billing.plan_changed',
      targetType: 'institute',
      targetId: institute.id,
      metadata: {
        from: before?.planCode ?? null,
        to: plan.code,
        trialEndsOn,
      },
    });
    return sub;
  }

  async usage(tx: TxClient): Promise<Record<LimitKind, number>> {
    const live = { where: { deletedAt: null } };
    const [departments, sections, faculty, students] = await Promise.all([
      tx.department.count(live),
      tx.section.count(live),
      tx.faculty.count(live),
      tx.student.count(live),
    ]);
    return { departments, sections, faculty, students };
  }

  async status(tx: TxClient, institute: { id: string; timezone: string }): Promise<PlanStatusDto> {
    const sub = await tx.instituteSubscription.findUnique({
      where: { instituteId: institute.id },
    });
    const plan = planOf(sub);
    const trialEndsOn = fromDate(sub?.trialEndsOn ?? null);
    return {
      plan: { code: plan.code, name: plan.name },
      trialEndsOn,
      trialDaysLeft: trialEndsOn ? trialDaysLeft(trialEndsOn, todayIn(institute.timezone)) : null,
      usage: usageReport(plan, await this.usage(tx)),
    };
  }

  /**
   * For create endpoints (P1 master data, imports): refuses adding `adding` more of `kind`
   * beyond the institute's plan, in plain words. Call inside the same transaction as the
   * insert.
   */
  async assertCanAdd(
    tx: TxClient,
    instituteId: string,
    kind: LimitKind,
    adding = 1,
  ): Promise<void> {
    const sub = await tx.instituteSubscription.findUnique({ where: { instituteId } });
    const plan = planOf(sub);
    const used = (await this.usage(tx))[kind];
    const check = checkLimit(plan, kind, used, adding);
    if (!check.ok) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'plan_limit',
        message: `Your ${plan.name} plan allows ${check.limit} ${kind}; you have ${used}. Ask Slotwise to move you to a bigger plan.`,
        kind,
        limit: check.limit,
        used,
      });
    }
  }
}
