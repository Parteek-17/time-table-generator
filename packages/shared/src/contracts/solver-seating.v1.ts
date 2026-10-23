/**
 * Exam seating solver v1: `POST /v1/seating/solve` on the Python solver (services/solver).
 * JSON Schema for Python: services/solver/contracts/seating_v1.schema.json (generated).
 * Producer of requests: P6 (from a BullMQ job). Producer of responses: P6 (seating module in
 * the solver). Fixtures: `demoExamSeatingRequest()`, `demoExamSeatingResponse()`.
 *
 * One request = one exam session (date + session) across the halls offered. Seats are
 * addressed by (row, column), both 1-based, row 1 at the front, column 1 on the left as the
 * invigilator faces the hall. A bench holds `seatsPerBench` adjacent columns.
 *
 * Rules (CLAUDE.md): two students writing the same paper never sit adjacent (left/right or
 * front/back); fill halls in roll-number order interleaving papers; respect exam capacity and
 * the reserve; accessibility needs get ground-floor/front seats; invigilation is balanced,
 * respects availability, and never puts a teacher in a hall writing their own paper.
 */
import { z } from 'zod';
import { Count, Id, IsoDate } from './common.v1';

export const SOLVER_SEATING_V1 = 'solver-seating.v1' as const;

export const SeatingPaperV1 = z.object({
  /** Paper id (P6's exam paper). */
  id: Id,
  /** Course code, e.g. "CS301". */
  code: z.string(),
  /** Title for charts. */
  title: z.string(),
});

export const SeatingStudentV1 = z.object({
  /** Student id. */
  id: Id,
  /** Roll number used for ordering and notices, e.g. "2315179". */
  rollNo: z.string(),
  /** Paper they write in this session. */
  paperId: Id,
  /** Section, for interleaving branches and for notices. */
  sectionId: Id.nullable(),
  /** Needs a ground-floor / front seat. */
  needsAccessibleSeat: z.boolean(),
});

export const SeatingHallV1 = z.object({
  /** Room id. */
  id: Id,
  /** e.g. "G16". */
  code: z.string(),
  /** 0 = ground floor. */
  floor: z.int(),
  /** Ground floor or reachable by lift. */
  isAccessible: z.boolean(),
  /** Bench rows. */
  rows: z.int().min(1),
  /** Benches per row. */
  benchesPerRow: z.int().min(1),
  /** Exam seats per bench (usually 1 or 2). */
  seatsPerBench: z.int().min(1),
  /** Fill order preference: lower first. */
  order: Count,
});

export const SeatingFacultyV1 = z.object({
  /** Faculty id. */
  id: Id,
  /** Display name. */
  name: z.string(),
  /** False if on leave or otherwise unavailable this session. */
  available: z.boolean(),
  /** Papers they teach: never invigilate a hall writing one of these. */
  teachesPaperIds: z.array(Id),
  /** Duties already given this exam season, for balancing. */
  dutiesSoFar: Count,
});

export const SolverSeatingRequestV1 = z.object({
  /** Always "solver-seating.v1". */
  version: z.literal(SOLVER_SEATING_V1),
  /** Correlation id chosen by the caller; echoed in the response. */
  requestId: z.string().min(1),
  /** Exam session (P6). */
  examSessionId: Id,
  /** Exam date. */
  date: IsoDate,
  /** e.g. "Morning". */
  sessionLabel: z.string(),
  /** Papers written in this session. */
  papers: z.array(SeatingPaperV1),
  /** Students writing, any order (the solver sorts by roll number). */
  students: z.array(SeatingStudentV1),
  /** Halls offered, any order (the solver uses `order`). */
  halls: z.array(SeatingHallV1),
  /** Faculty who could invigilate; empty = skip invigilation. */
  faculty: z.array(SeatingFacultyV1),
  /** How to seat. */
  options: z.object({
    /** Seats to keep empty per hall (e.g. for late changes). */
    reserveSeatsPerHall: Count.default(0),
    /** Invigilators per hall: max(minimum, ceil(students / studentsPerInvigilator)). */
    invigilators: z
      .object({
        /** At least this many per hall. */
        minimumPerHall: z.int().min(1).default(1),
        /** One more invigilator per this many students. */
        studentsPerInvigilator: z.int().min(1).default(30),
      })
      .default({ minimumPerHall: 1, studentsPerInvigilator: 30 }),
    /** Stop after this many seconds. */
    timeLimitSeconds: z.number().positive().max(600).default(30),
    /** Random seed for repeatable results. */
    seed: z.int().min(0).default(0),
  }),
});

export const SeatAssignmentV1 = z.object({
  /** Student id. */
  studentId: Id,
  /** Paper id. */
  paperId: Id,
  /** Hall (room) id. */
  hallId: Id,
  /** 1-based, front row first. */
  row: z.int().min(1),
  /** 1-based seat column from the left (benches × seatsPerBench columns per row). */
  column: z.int().min(1),
  /** Label printed on charts, e.g. "G16-R3-C2". */
  label: z.string(),
});

export const SolverSeatingResponseV1 = z.object({
  /** Always "solver-seating.v1". */
  version: z.literal(SOLVER_SEATING_V1),
  /** Echo of requestId. */
  requestId: z.string(),
  /**
   * OPTIMAL / FEASIBLE: everyone seated within the rules. INFEASIBLE: not enough seats or
   * the adjacency rule cannot be met (see unseated). TIMEOUT: partial result.
   */
  status: z.enum(['OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'TIMEOUT']),
  /** Wall-clock seconds used. */
  solveSeconds: z.number().min(0),
  /** One per seated student. */
  seats: z.array(SeatAssignmentV1),
  /** Students without a seat. */
  unseated: z.array(
    z.object({
      /** Student id. */
      studentId: Id,
      /** Why. */
      reason: z.enum(['not_enough_seats', 'no_accessible_seat', 'adjacency', 'time_limit']),
      /** Plain-language explanation. */
      message: z.string(),
    }),
  ),
  /** Per-hall summary. */
  halls: z.array(
    z.object({
      /** Hall id. */
      hallId: Id,
      /** Exam seats in the hall. */
      capacity: Count,
      /** Seats used. */
      used: Count,
      /** Seats left empty on purpose. */
      reserved: Count,
      /** Papers written in it. */
      paperIds: z.array(Id),
      /** Invigilators assigned. */
      invigilatorIds: z.array(Id),
    }),
  ),
  /** Halls short of invigilators, with a plain-language message. */
  invigilationProblems: z.array(
    z.object({
      /** Hall id. */
      hallId: Id,
      /** How many more are needed. */
      missing: z.int().min(1),
      /** e.g. "Only 1 of 2 invigilators for G16: everyone else teaches CS301." */
      message: z.string(),
    }),
  ),
});

export type SolverSeatingRequestV1 = z.infer<typeof SolverSeatingRequestV1>;
export type SolverSeatingRequestV1Input = z.input<typeof SolverSeatingRequestV1>;
export type SolverSeatingResponseV1 = z.infer<typeof SolverSeatingResponseV1>;
export type SeatAssignmentV1 = z.infer<typeof SeatAssignmentV1>;

/** Solver route (relative to SOLVER_URL). */
export const SOLVER_SEATING_V1_ROUTE = '/v1/seating/solve' as const;
