import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { API_JWT_AUDIENCE, API_JWT_ISSUER, INSTITUTE_SLUG_HEADER } from '@slotwise/shared';
import {
  TIMETABLE_READ_V1_ROUTE,
  TimetableReadResponseV1,
  type TimetableReadQueryV1,
} from '@slotwise/shared/contracts';
import { SignJWT } from 'jose';
import { ENV, type Env } from '../config/env';

/** () => base URL of this same API, for calling P2T's route. Tests point it at their listening app. */
export const PORTAL_API_BASE = Symbol('PORTAL_API_BASE');

export function portalApiBase(env: Env): () => string {
  return () => `http://localhost:${env.API_PORT ?? env.PORT}`;
}

export interface PublishedWeekRequest {
  instituteSlug: string;
  /** The viewer; the timetable is read with their permissions. */
  userId: string;
  termId: string;
  query: Omit<TimetableReadQueryV1, 'versionId'>;
}

const UNAVAILABLE = 'Your timetable can’t be loaded right now. Please try again in a minute.';

/**
 * The viewer's published week through P2T's timetable-read.v1. P2T's route lives in this same
 * API; it is called over HTTP as the viewer so its permission checks apply and P5 never reads
 * P2T's tables (docs/coordination/CONTRACTS.md).
 */
@Injectable()
export class PublishedTimetableClient {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(PORTAL_API_BASE) private readonly baseUrl: () => string,
  ) {}

  async week(req: PublishedWeekRequest): Promise<TimetableReadResponseV1> {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(req.userId)
      .setIssuer(API_JWT_ISSUER)
      .setAudience(API_JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(this.env.API_JWT_SECRET));
    const params = new URLSearchParams(
      Object.entries(req.query).filter((e): e is [string, string] => typeof e[1] === 'string'),
    );
    const path = TIMETABLE_READ_V1_ROUTE.replace(':termId', req.termId);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl()}${path}?${params}`, {
        headers: {
          authorization: `Bearer ${token}`,
          [INSTITUTE_SLUG_HEADER]: req.instituteSlug,
          accept: 'application/json',
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new ServiceUnavailableException(UNAVAILABLE);
    }
    // P2T's flag off: nothing published to show yet.
    if (res.status === 404) return { contract: 'timetable-read.v1', version: null, slots: [] };
    if (!res.ok) throw new ServiceUnavailableException(UNAVAILABLE);
    const parsed = TimetableReadResponseV1.safeParse(await res.json());
    if (!parsed.success) throw new ServiceUnavailableException(UNAVAILABLE);
    return parsed.data;
  }
}
