import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PLANS, type PlatformInstituteDto, type SetPlanInput } from '@slotwise/shared/platform';
import { planOf, BillingService } from '../billing/billing.service';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../db/prisma.service';

/** At most this many institutes per page on the platform screen. */
const PAGE_SIZE = 50;

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Newest first. Plans are tenant rows, so each is read inside its own institute. */
  async list(actorUserId: string, search = ''): Promise<PlatformInstituteDto[]> {
    const q = search.trim();
    // institutes is a global table.
    const institutes = await this.prisma.institute.findMany({
      where: {
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' as const } },
                { slug: { contains: q.toLowerCase() } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
    });
    const out: PlatformInstituteDto[] = [];
    for (const inst of institutes) {
      const sub = await this.prisma.tenant({ instituteId: inst.id, userId: actorUserId }, (tx) =>
        tx.instituteSubscription.findUnique({ where: { instituteId: inst.id } }),
      );
      out.push({
        id: inst.id,
        name: inst.name,
        slug: inst.slug,
        type: inst.type,
        isSample: inst.isSample,
        createdAt: inst.createdAt.toISOString(),
        url: this.env.WEB_URL_TEMPLATE.replace('{slug}', inst.slug),
        plan: sub
          ? {
              code: sub.planCode,
              name: planOf(sub).name,
              trialEndsOn: sub.trialEndsOn?.toISOString().slice(0, 10) ?? null,
            }
          : null,
      });
    }
    return out;
  }

  async setPlan(
    actorUserId: string,
    instituteId: string,
    input: SetPlanInput,
  ): Promise<PlatformInstituteDto['plan']> {
    const institute = await this.prisma.institute.findFirst({
      where: { id: instituteId, deletedAt: null },
    });
    if (!institute) throw new NotFoundException('We could not find that institute.');
    const sub = await this.prisma.tenant({ instituteId, userId: actorUserId }, (tx) =>
      this.billing.setPlan(tx, institute, input, actorUserId),
    );
    return {
      code: sub.planCode,
      name: PLANS[input.planCode].name,
      trialEndsOn: sub.trialEndsOn?.toISOString().slice(0, 10) ?? null,
    };
  }
}
