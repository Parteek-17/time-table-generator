import { Inject, Injectable, Logger } from '@nestjs/common';
import { API_JWT_AUDIENCE, API_JWT_ISSUER } from '@slotwise/shared';
import {
  RECIPIENTS_V1_ROUTE,
  RecipientsResponseV1,
  type RecipientsQueryV1,
  type RecipientV1,
} from '@slotwise/shared/reschedule';
import { SignJWT } from 'jose';
import { ENV, type Env } from '../config/env';

export interface RecipientsCall {
  instituteSlug: string;
  /** The user whose action caused the notification; the lookup runs with their permissions. */
  actorUserId: string;
  query: RecipientsQueryV1;
}

/**
 * Turns sections, sub-groups, teachers and users into people with an email address, through
 * the proposed recipients.v1 route (P1 owns faculty and students; P4 never reads their tables).
 * Until that route exists it answers 404, and notify sends nothing (logged once). Tests replace
 * this provider.
 */
@Injectable()
export class RecipientsSource {
  private readonly logger = new Logger(RecipientsSource.name);
  private warnedMissing = false;

  constructor(@Inject(ENV) private readonly env: Env) {}

  async resolve(call: RecipientsCall): Promise<RecipientV1[]> {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(call.actorUserId)
      .setIssuer(API_JWT_ISSUER)
      .setAudience(API_JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(this.env.API_JWT_SECRET));
    const port = this.env.API_PORT ?? this.env.PORT;
    const res = await fetch(`http://localhost:${port}${RECIPIENTS_V1_ROUTE}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'x-institute-slug': call.instituteSlug,
        'content-type': 'application/json',
      },
      body: JSON.stringify(call.query),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 404) {
      if (!this.warnedMissing) {
        this.logger.warn(
          'POST /people/recipients does not exist yet (recipients.v1, P1); notifications are not sent.',
        );
        this.warnedMissing = true;
      }
      return [];
    }
    if (!res.ok) throw new Error(`recipients lookup failed with ${res.status}`);
    return RecipientsResponseV1.parse(await res.json()).recipients;
  }
}
