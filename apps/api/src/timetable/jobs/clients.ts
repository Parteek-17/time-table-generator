import { Inject, Injectable } from '@nestjs/common';
import { API_JWT_AUDIENCE, API_JWT_ISSUER } from '@slotwise/shared';
import {
  SETUP_SNAPSHOT_V1_ROUTE,
  SetupSnapshotV1,
  SOLVER_TIMETABLE_V1_ROUTE,
  SolverTimetableResponseV1,
  type SolverTimetableRequestV1,
} from '@slotwise/shared/contracts';
import { SignJWT } from 'jose';
import { ENV, type Env } from '../../config/env';
import { TIMETABLE_CONFIG, type TimetableConfig } from '../timetable.config';
import { fixtureSnapshot } from './snapshot.mock';
import { mockSolve } from './solver.mock';

/** A problem a coordinator can act on; its message is shown to them as is. */
export class SolveProblem extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SolveProblem';
  }
}

export interface SnapshotRequest {
  instituteSlug: string;
  /** The coordinator who asked; the snapshot is read with their permissions. */
  userId: string;
  termId: string;
  scopeId: string | null;
}

/** The term's setup data (setup-snapshot.v1), from P1's endpoint or the fixture. */
@Injectable()
export class SnapshotClient {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(TIMETABLE_CONFIG) private readonly config: TimetableConfig,
  ) {}

  async get(req: SnapshotRequest): Promise<SetupSnapshotV1> {
    if (this.config.SNAPSHOT_SOURCE === 'fixture') return fixtureSnapshot();

    // P1's route lives in this same API; call it over HTTP as the coordinator, so its own
    // permission checks apply and P2T never imports P1's code.
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(req.userId)
      .setIssuer(API_JWT_ISSUER)
      .setAudience(API_JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(this.env.API_JWT_SECRET));
    const path = SETUP_SNAPSHOT_V1_ROUTE.replace(':termId', req.termId);
    const query = req.scopeId ? `?scopeId=${req.scopeId}` : '';
    const port = this.env.API_PORT ?? this.env.PORT;
    let res: Response;
    try {
      res = await fetch(`http://localhost:${port}${path}${query}`, {
        headers: { authorization: `Bearer ${token}`, 'x-institute-slug': req.instituteSlug },
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new SolveProblem('We could not read the setup data for this term. Please try again.');
    }
    if (!res.ok) {
      throw new SolveProblem(
        res.status === 403
          ? 'You don’t have permission to read the setup data for this term.'
          : 'We could not read the setup data for this term. Check the term’s setup and try again.',
      );
    }
    const parsed = SetupSnapshotV1.safeParse(await res.json());
    if (!parsed.success) {
      throw new SolveProblem(
        'The setup data for this term is incomplete. Run the readiness check.',
      );
    }
    return parsed.data;
  }
}

/** The timetable solver (solver-timetable.v1), over HTTP or the mock. */
@Injectable()
export class SolverClient {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(TIMETABLE_CONFIG) private readonly config: TimetableConfig,
  ) {}

  async solve(request: SolverTimetableRequestV1): Promise<SolverTimetableResponseV1> {
    if (this.config.SOLVER_SOURCE === 'mock') {
      return mockSolve(request, this.config.SOLVER_MOCK_DELAY_MS);
    }
    const url = new URL(SOLVER_TIMETABLE_V1_ROUTE, this.env.SOLVER_URL);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        // The solver stops itself at timeLimitSeconds; allow a minute for setup and transfer.
        signal: AbortSignal.timeout((request.options.timeLimitSeconds + 60) * 1000),
      });
    } catch {
      throw new SolveProblem(
        'The timetable engine is not answering. Please try again in a minute.',
      );
    }
    if (!res.ok) {
      throw new SolveProblem(
        `The timetable engine could not work on this term (error ${res.status}). Please try again.`,
      );
    }
    const parsed = SolverTimetableResponseV1.safeParse(await res.json());
    if (!parsed.success || parsed.data.requestId !== request.requestId) {
      throw new SolveProblem('The timetable engine sent an answer we could not read.');
    }
    return parsed.data;
  }
}
