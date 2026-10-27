import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { API_JWT_AUDIENCE, API_JWT_ISSUER } from '@slotwise/shared';
import {
  SETUP_SNAPSHOT_V1_ROUTE,
  SetupSnapshotV1,
  TIMETABLE_READ_V1_ROUTE,
  TimetableReadResponseV1,
  type TimetableSlotV1,
  type TimetableVersionV1,
} from '@slotwise/shared/contracts';
import { demoPublishedTimetable, demoTermSnapshot } from '@slotwise/shared/fixtures';
import { SignJWT } from 'jose';
import type { Tenant } from '../common/request-context';
import { ENV, type Env } from '../config/env';
import { RESCHEDULE_CONFIG, type RescheduleConfig } from './reschedule.config';

/** Whose classes to read from the published timetable. */
export type SlotQuery = { sectionIds: readonly string[] } | { facultyId: string };

export interface PublishedClasses {
  /** null when nothing is published for the term yet. */
  version: TimetableVersionV1 | null;
  /** De-duplicated by slot id. */
  slots: TimetableSlotV1[];
}

/**
 * The two things P4 reads from other streams, only through their contracts: the term's setup
 * (setup-snapshot.v1, P1) and its published timetable (timetable-read.v1, P2T). Both routes
 * live in this API; P4 calls them over HTTP as the user, so their own permission checks apply
 * and P4 never imports their code or reads their tables. Tests replace this provider.
 */
@Injectable()
export class TermSource {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(RESCHEDULE_CONFIG) private readonly config: RescheduleConfig,
  ) {}

  async snapshot(tenant: Tenant, termId: string): Promise<SetupSnapshotV1> {
    if (this.config.RESCHEDULE_SOURCE === 'fixture') return demoTermSnapshot();
    const body = await this.get(tenant, SETUP_SNAPSHOT_V1_ROUTE.replace(':termId', termId));
    const parsed = SetupSnapshotV1.safeParse(body);
    if (!parsed.success) {
      throw new ServiceUnavailableException(
        'The setup data for this term is incomplete. Run the readiness check.',
      );
    }
    return parsed.data;
  }

  async published(tenant: Tenant, termId: string, query: SlotQuery): Promise<PublishedClasses> {
    if (this.config.RESCHEDULE_SOURCE === 'fixture') {
      const { version, slots } = demoPublishedTimetable();
      return { version, slots: slots.filter((s) => matches(s, query)) };
    }
    const path = TIMETABLE_READ_V1_ROUTE.replace(':termId', termId);
    const queries =
      'facultyId' in query
        ? [`facultyId=${query.facultyId}`]
        : query.sectionIds.map((id) => `sectionId=${id}`);
    const responses = await inBatches(queries, 4, async (q) => {
      const parsed = TimetableReadResponseV1.safeParse(await this.get(tenant, `${path}?${q}`));
      if (!parsed.success) {
        throw new ServiceUnavailableException('We could not read the published timetable.');
      }
      return parsed.data;
    });
    const version = responses.find((r) => r.version)?.version ?? null;
    const slots = new Map<string, TimetableSlotV1>();
    for (const r of responses) for (const s of r.slots) slots.set(s.id, s);
    return { version, slots: [...slots.values()] };
  }

  private async get(tenant: Tenant, path: string): Promise<unknown> {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(tenant.user.id)
      .setIssuer(API_JWT_ISSUER)
      .setAudience(API_JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(this.env.API_JWT_SECRET));
    const port = this.env.API_PORT ?? this.env.PORT;
    let res: Response;
    try {
      res = await fetch(`http://localhost:${port}${path}`, {
        headers: { authorization: `Bearer ${token}`, 'x-institute-slug': tenant.institute.slug },
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new ServiceUnavailableException(
        'We could not read this term’s timetable. Please try again.',
      );
    }
    if (res.status === 404) throw new NotFoundException('We can’t find this term.');
    if (!res.ok) {
      throw new ServiceUnavailableException(
        'We could not read this term’s timetable. Please try again.',
      );
    }
    return res.json();
  }
}

function matches(slot: TimetableSlotV1, query: SlotQuery): boolean {
  return 'facultyId' in query
    ? slot.faculty.some((f) => f.id === query.facultyId)
    : slot.sectionIds.some((s) => query.sectionIds.includes(s));
}

async function inBatches<T, R>(items: readonly T[], size: number, fn: (item: T) => Promise<R>) {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}
