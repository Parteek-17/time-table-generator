/**
 * JSON Schemas of the solver contracts, for the Python solver (services/solver/contracts).
 * Regenerate with `pnpm contracts:schemas` after a new contract version; a test fails when
 * the committed files differ from these.
 */
import { z } from 'zod';
import { SolverSeatingRequestV1, SolverSeatingResponseV1 } from './solver-seating.v1';
import { SolverTimetableRequestV1, SolverTimetableResponseV1 } from './solver-timetable.v1';

type JsonObject = Record<string, unknown>;

function bundle(
  id: string,
  title: string,
  schemas: Record<string, { schema: z.ZodType; io: 'input' | 'output' }>,
): JsonObject {
  const defs: JsonObject = {};
  for (const [name, { schema, io }] of Object.entries(schemas)) {
    // Requests are validated as sent (defaults optional); responses as produced.
    const json = z.toJSONSchema(schema, { io, unrepresentable: 'any' }) as JsonObject;
    delete json.$schema;
    defs[name] = json;
  }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: id,
    title,
    description:
      'Generated from packages/shared/src/contracts (zod). Do not edit; see docs/coordination/CONTRACTS.md.',
    $defs: defs,
  };
}

/** File name (in services/solver/contracts) → JSON Schema. */
export function solverJsonSchemas(): Record<string, JsonObject> {
  return {
    'timetable_v1.schema.json': bundle('slotwise:solver-timetable.v1', 'Timetable solver v1', {
      SolverTimetableRequestV1: { schema: SolverTimetableRequestV1, io: 'input' },
      SolverTimetableResponseV1: { schema: SolverTimetableResponseV1, io: 'output' },
    }),
    'seating_v1.schema.json': bundle('slotwise:solver-seating.v1', 'Exam seating solver v1', {
      SolverSeatingRequestV1: { schema: SolverSeatingRequestV1, io: 'input' },
      SolverSeatingResponseV1: { schema: SolverSeatingResponseV1, io: 'output' },
    }),
  };
}
