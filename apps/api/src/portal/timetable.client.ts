import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { API_JWT_AUDIENCE, API_JWT_ISSUER, INSTITUTE_SLUG_HEADER } from '@slotwise/shared';
import {
  TIMETABLE_READ_V1_ROUTE,
  TimetableReadResponseV1,
  type TimetableReadQueryV1,
} from '@slotwise/shared/contracts';
import { MY_EXAMS_ROUTE, MyExamsAdapter } from '@slotwise/shared/portal';
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
 * Other streams' routes in this same API, called over HTTP as the viewer so their permission
 * checks apply and P5 never reads their tables (docs/coordination/CONTRACTS.md): P2T's
 * timetable-read.v1 and P6's "my exams".
 */
@Injectable()
export class PublishedTimetableClient {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(PORTAL_API_BASE) private readonly baseUrl: () => string,
  ) {}

  /** GET as the user; null when the API can't be reached. */
  private async get(path: string, userId: string, instituteSlug: string, timeoutMs: number) {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer(API_JWT_ISSUER)
      .setAudience(API_JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(this.env.API_JWT_SECRET));
    try {
      return await fetch(`${this.baseUrl()}${path}`, {
        headers: {
          authorization: `Bearer ${token}`,
          [INSTITUTE_SLUG_HEADER]: instituteSlug,
          accept: 'application/json',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return null;
    }
  }

  async week(req: PublishedWeekRequest): Promise<TimetableReadResponseV1> {
    const params = new URLSearchParams(
      Object.entries(req.query).filter((e): e is [string, string] => typeof e[1] === 'string'),
    );
    const path = TIMETABLE_READ_V1_ROUTE.replace(':termId', req.termId);
    const res = await this.get(`${path}?${params}`, req.userId, req.instituteSlug, 20_000);
    if (!res) throw new ServiceUnavailableException(UNAVAILABLE);
    // P2T's flag off: nothing published to show yet.
    if (res.status === 404) return { contract: 'timetable-read.v1', version: null, slots: [] };
    if (!res.ok) throw new ServiceUnavailableException(UNAVAILABLE);
    const parsed = TimetableReadResponseV1.safeParse(await res.json());
    if (!parsed.success) throw new ServiceUnavailableException(UNAVAILABLE);
    return parsed.data;
  }

  /**
   * The viewer's published exam seats from P6's `GET /exams/me`, or null when P6 is off, not
   * deployed, slow or answers in a shape P5 doesn't know. Never fails "Today".
   */
  async myExams(instituteSlug: string, userId: string): Promise<MyExamsAdapter | null> {
    const res = await this.get(MY_EXAMS_ROUTE, userId, instituteSlug, 5_000);
    if (!res?.ok) return null;
    const parsed = MyExamsAdapter.safeParse(await res.json().catch(() => null));
    return parsed.success ? parsed.data : null;
  }
}
