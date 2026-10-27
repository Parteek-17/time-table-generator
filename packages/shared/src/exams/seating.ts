/**
 * Seating plans: building a solver-seating.v1 request from the institute's rooms and students,
 * and what the API returns about a plan.
 */
import { z } from 'zod';
import { Id } from '../contracts/common.v1';
import type { SolverSeatingRequestV1 } from '../contracts/solver-seating.v1';

type Hall = SolverSeatingRequestV1['halls'][number];

/** Class seats per bench assumed when turning a room's seats per row into benches. */
export const CLASS_SEATS_PER_BENCH = 2;

export interface RoomForHall {
  id: string;
  code: string;
  floor: number;
  isAccessible: boolean;
  rows: number | null;
  seatsPerRow: number | null;
  examSeatsPerBench: number | null;
}

/**
 * A room as an exam hall, or null when it has no exam seats (rows, seats per row or exam seats
 * per bench missing or 0). Rooms list seats per row for classes on two-seater benches; in exams
 * each bench takes `examSeatsPerBench` students (usually 1).
 */
export function hallFromRoom(room: RoomForHall, order: number): Hall | null {
  if (!room.rows || !room.seatsPerRow || !room.examSeatsPerBench) return null;
  return {
    id: room.id,
    code: room.code,
    floor: room.floor,
    isAccessible: room.isAccessible,
    rows: room.rows,
    benchesPerRow: Math.ceil(room.seatsPerRow / CLASS_SEATS_PER_BENCH),
    seatsPerBench: room.examSeatsPerBench,
    order,
  };
}

/** Exam seats in a hall. */
export const hallCapacity = (hall: Pick<Hall, 'rows' | 'benchesPerRow' | 'seatsPerBench'>) =>
  hall.rows * hall.benchesPerRow * hall.seatsPerBench;

export const BuildSeatingInput = z.object({
  /** Rooms to use, in fill order. Empty or missing = every room with exam seats. */
  hallIds: z.array(Id).optional(),
});
export type BuildSeatingInput = z.infer<typeof BuildSeatingInput>;

export type SeatingPlanStatus =
  'queued' | 'running' | 'ready' | 'failed' | 'published' | 'archived';

export interface SeatingHallDto {
  hallId: string;
  code: string;
  capacity: number;
  used: number;
  reserved: number;
  /** Paper codes written in it. */
  papers: string[];
  /** Invigilator names. */
  invigilators: string[];
}

export interface SeatingPlanDto {
  id: string;
  sessionId: string;
  status: SeatingPlanStatus;
  /** OPTIMAL, FEASIBLE, INFEASIBLE or TIMEOUT once solved. */
  solverStatus: string | null;
  /** Plain-language reason when the job failed. */
  error: string | null;
  seated: number;
  halls: SeatingHallDto[];
  unseated: { studentId: string; rollNo: string; reason: string; message: string }[];
  invigilationProblems: { hallId: string; missing: number; message: string }[];
  createdAt: string;
  publishedAt: string | null;
}

/** What a plan stores from the solver response in `problems`. */
export interface StoredSeatingProblems {
  unseated: SeatingPlanDto['unseated'];
  invigilationProblems: SeatingPlanDto['invigilationProblems'];
}

export const SetUnavailableInput = z.object({
  /** Faculty who cannot invigilate in this session; replaces the earlier list. */
  facultyIds: z.array(Id),
});
export type SetUnavailableInput = z.infer<typeof SetUnavailableInput>;

/** One faculty member as a possible invigilator of a session. */
export interface InvigilatorDto {
  facultyId: string;
  name: string;
  available: boolean;
  /** Codes of this session's papers they teach (never in those halls). */
  teaches: string[];
  /** Duties in the exam's other sessions. */
  dutiesSoFar: number;
}
