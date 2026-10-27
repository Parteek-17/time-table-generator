import { Inject, Injectable } from '@nestjs/common';
import {
  SOLVER_SEATING_V1_ROUTE,
  SolverSeatingResponseV1,
  type SolverSeatingRequestV1,
} from '@slotwise/shared/contracts';
import { ENV, type Env } from '../../config/env';

/** A problem the exam coordinator can act on; its message is shown to them as is. */
export class SeatingProblem extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeatingProblem';
  }
}

/** The seating solver (solver-seating.v1) over HTTP. Only the background job calls it. */
@Injectable()
export class SeatingSolverClient {
  constructor(@Inject(ENV) private readonly env: Env) {}

  async solve(request: SolverSeatingRequestV1): Promise<SolverSeatingResponseV1> {
    const url = new URL(SOLVER_SEATING_V1_ROUTE, this.env.SOLVER_URL);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout((request.options.timeLimitSeconds + 60) * 1000),
      });
    } catch {
      throw new SeatingProblem(
        'The seating engine is not answering. Please try again in a minute.',
      );
    }
    if (!res.ok) {
      throw new SeatingProblem(
        `The seating engine could not work on this session (error ${res.status}). Please try again.`,
      );
    }
    const parsed = SolverSeatingResponseV1.safeParse(await res.json());
    if (!parsed.success || parsed.data.requestId !== request.requestId) {
      throw new SeatingProblem('The seating engine sent an answer we could not read.');
    }
    return parsed.data;
  }
}
