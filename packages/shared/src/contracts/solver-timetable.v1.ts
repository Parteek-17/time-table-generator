/**
 * Timetable solver v1: `POST /v1/timetable/solve` on the Python solver (services/solver).
 * JSON Schema for Python: services/solver/contracts/timetable_v1.schema.json (generated, see
 * docs/coordination/CONTRACTS.md).
 *
 * Producer of requests: P2T (from a BullMQ job, never inside an HTTP request).
 * Producer of responses: P2E. Fixtures: `demoTermSnapshot()`, `demoTermSolution()`.
 *
 * A *session* is one meeting of a teaching assignment in the week. Each assignment needs
 * `periodsPerWeek` periods: lectures and tutorials are 1-period sessions, practicals are
 * blocks of the course's `labBlockLength` (the last block may be shorter). Session ids are
 * `<assignmentId>#<n>` with n = 1, 2, … in that order, so they are stable between runs.
 */
import { z } from 'zod';
import { ComponentV1, Count, Id, PeriodIndex, TargetRefV1, Weekday } from './common.v1';
import { SetupSnapshotV1, type SnapshotAssignmentV1 } from './setup-snapshot.v1';

export const SOLVER_TIMETABLE_V1 = 'solver-timetable.v1' as const;

/** `<assignmentId>#<n>`, n starting at 1. */
export const SessionId = z.string().regex(/^[0-9a-f-]{36}#[1-9]\d*$/);

/** Where one session sits in the week. */
export const PlacementV1 = z.object({
  /** `<assignmentId>#<n>`. */
  sessionId: SessionId,
  /** ISO weekday (1 = Monday). */
  weekday: Weekday,
  /** First period of the session. */
  startPeriodIndex: PeriodIndex,
  /** Number of consecutive periods (1 for lectures and tutorials). */
  length: z.int().min(1),
  /** Room it is held in. */
  roomId: Id,
});

/** A resource that is already busy at a cell (e.g. booked by another scope's timetable). */
export const BusySlotV1 = z.object({
  /** Kind of resource. */
  resource: z.enum(['faculty', 'room', 'section', 'subgroup', 'elective_section']),
  /** Its id. */
  id: Id,
  /** ISO weekday. */
  weekday: Weekday,
  /** Period that is busy. */
  periodIndex: PeriodIndex,
  /** Plain-language reason, for explanations, e.g. "CSE timetable (published)". */
  reason: z.string().optional(),
});

export const SOFT_CONSTRAINTS_V1 = [
  /** A course's theory periods spread across days (max one per day unless L+T > days). */
  'theory_spread',
  /** More than 3 consecutive periods for a faculty member. */
  'faculty_consecutive',
  /** Classes in late-day periods. */
  'late_slots',
  /** Idle gaps in a section's day. */
  'section_idle_gaps',
  /** A section away from its home room. */
  'home_room',
  /** Preferred room or lab category not used. */
  'preferred_room',
] as const;
export const SoftConstraintV1 = z.enum(SOFT_CONSTRAINTS_V1);

export const SolverTimetableOptionsV1 = z.object({
  /** Stop after this many seconds and return the best found (status TIMEOUT or FEASIBLE). */
  timeLimitSeconds: z.number().positive().max(3600).default(60),
  /** Random seed; same input + seed → same output. */
  seed: z.int().min(0).default(0),
  /** Sessions that must stay exactly where they are (manual edits the user locked). */
  lockedSessions: z.array(PlacementV1).default([]),
  /** Cells already taken outside this problem. */
  busySlots: z.array(BusySlotV1).default([]),
  /** Weight per soft constraint (0 = ignore). Missing keys use the solver's defaults. */
  weights: z.partialRecord(SoftConstraintV1, z.number().min(0)).default({}),
});

export const SolverTimetableRequestV1 = z.object({
  /** Always "solver-timetable.v1". */
  version: z.literal(SOLVER_TIMETABLE_V1),
  /** Correlation id chosen by the caller (e.g. the BullMQ job id); echoed in the response. */
  requestId: z.string().min(1),
  /** The term's master data. */
  snapshot: SetupSnapshotV1,
  /** How to solve. */
  options: SolverTimetableOptionsV1,
});

export const PlacedSessionV1 = PlacementV1.extend({
  /** Teaching assignment the session belongs to. */
  assignmentId: Id,
  /** Course id (denormalised for display). */
  courseId: Id,
  /** lecture, tutorial or practical. */
  component: ComponentV1,
  /** Audience. */
  target: TargetRefV1,
  /** Teachers of the assignment (all busy). */
  facultyIds: z.array(Id),
  /** True when it came from options.lockedSessions. */
  locked: z.boolean(),
});

export const UNPLACED_REASONS_V1 = [
  /** No cell where section, faculty and a room are all free. */
  'no_free_slot',
  /** Faculty unavailable in every cell that would otherwise work. */
  'faculty_unavailable',
  /** Placing it would break a faculty member's max periods per day or week. */
  'faculty_over_max',
  /** No room of the needed type / lab category exists. */
  'no_suitable_room',
  /** Rooms of the right type exist but none is big enough. */
  'room_too_small',
  /** The lab block does not fit between breaks on any working day. */
  'lab_block_does_not_fit',
  /** Fixed slots (mentoring, library …) block every option. */
  'blocked_by_fixed_slot',
  /** A locked session conflicts with it. */
  'locked_conflict',
  /** The time limit ran out before it was placed. */
  'time_limit',
  /** None of the above; see message. */
  'other',
] as const;

export const UnplacedSessionV1 = z.object({
  /** `<assignmentId>#<n>`. */
  sessionId: SessionId,
  /** Teaching assignment. */
  assignmentId: Id,
  /** Why it could not be placed. */
  reason: z.enum(UNPLACED_REASONS_V1),
  /**
   * Plain-language explanation for the user, naming people and classes, e.g.
   * "Dr. Kaur has no free period on Wed afternoon for CS501".
   */
  message: z.string(),
  /** Everything involved, so the UI can offer fixes (open faculty, rooms, sections). */
  involved: z.object({
    /** Faculty involved. */
    facultyIds: z.array(Id),
    /** Rooms involved. */
    roomIds: z.array(Id),
    /** Sections involved. */
    sectionIds: z.array(Id),
    /** Sub-groups involved. */
    subGroupIds: z.array(Id),
    /** Elective sections involved. */
    electiveSectionIds: z.array(Id),
    /** Courses involved. */
    courseIds: z.array(Id),
  }),
});

export const SolverTimetableResponseV1 = z.object({
  /** Always "solver-timetable.v1". */
  version: z.literal(SOLVER_TIMETABLE_V1),
  /** Echo of the request's requestId. */
  requestId: z.string(),
  /**
   * OPTIMAL: proven best. FEASIBLE: every session placed, maybe not best. INFEASIBLE: some
   * sessions cannot be placed (see unplaced). TIMEOUT: time ran out (partial result).
   */
  status: z.enum(['OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'TIMEOUT']),
  /** Wall-clock seconds the solver used. */
  solveSeconds: z.number().min(0),
  /** Sessions with a place. */
  placed: z.array(PlacedSessionV1),
  /** Sessions without one, with reasons. */
  unplaced: z.array(UnplacedSessionV1),
  /** Soft-constraint penalties of this solution (lower is better). */
  score: z.object({
    /** Sum of weighted penalties. */
    total: z.number().min(0),
    /** One entry per soft constraint. */
    breakdown: z.array(
      z.object({
        /** Soft constraint. */
        constraint: SoftConstraintV1,
        /** Weight used. */
        weight: z.number().min(0),
        /** Number of violations. */
        count: Count,
        /** weight × violations (as the solver counts them). */
        penalty: z.number().min(0),
      }),
    ),
  }),
});

export type PlacementV1 = z.infer<typeof PlacementV1>;
export type BusySlotV1 = z.infer<typeof BusySlotV1>;
export type SoftConstraintV1 = z.infer<typeof SoftConstraintV1>;
export type SolverTimetableRequestV1 = z.infer<typeof SolverTimetableRequestV1>;
export type SolverTimetableRequestV1Input = z.input<typeof SolverTimetableRequestV1>;
export type PlacedSessionV1 = z.infer<typeof PlacedSessionV1>;
export type UnplacedSessionV1 = z.infer<typeof UnplacedSessionV1>;
export type SolverTimetableResponseV1 = z.infer<typeof SolverTimetableResponseV1>;

/** Solver route (relative to SOLVER_URL). */
export const SOLVER_TIMETABLE_V1_ROUTE = '/v1/timetable/solve' as const;

/** Sessions an assignment needs: 1-period sessions, or lab blocks for practicals. */
export function sessionLengths(
  periodsPerWeek: number,
  component: SnapshotAssignmentV1['component'],
  labBlockLength: number,
): number[] {
  if (component !== 'practical') return Array.from({ length: periodsPerWeek }, () => 1);
  const out: number[] = [];
  for (let left = periodsPerWeek; left > 0; left -= labBlockLength) {
    out.push(Math.min(labBlockLength, left));
  }
  return out;
}
