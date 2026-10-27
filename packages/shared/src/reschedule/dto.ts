/** Shapes the P4 API returns to the web app. */
import type { TimetableSlotV1 } from '../contracts';
import type { DisruptionKind, DisruptionScope } from './disruption';

export interface DisruptionDto {
  id: string;
  termId: string;
  kind: DisruptionKind | 'room_unavailable';
  title: string;
  scopeType: DisruptionScope;
  departmentId: string | null;
  sectionId: string | null;
  facultyId: string | null;
  startDate: string;
  endDate: string;
  startMinute: number | null;
  endMinute: number | null;
  createdAt: string;
  /** Set once undone. */
  deletedAt: string | null;
  /** Classes it cancels now. */
  cancelledCount: number;
}

export interface CreateDisruptionResult {
  disruption: DisruptionDto;
  /** Classes newly cancelled by it. */
  cancelled: number;
  /** Classes in its dates that were already cancelled (another holiday, by hand). */
  alreadyCancelled: number;
  /** True when nothing is published for the term yet, so there was nothing to cancel. */
  noTimetable: boolean;
}

export interface UndoDisruptionResult {
  disruptionId: string;
  /** Classes given back. */
  restored: number;
  /** Classes still cancelled because another disruption also covers them. */
  keptByOther: number;
}

export interface MakeUpDto {
  id: string;
  date: string;
  startPeriodIndex: number;
  length: number;
  startMinute: number;
  endMinute: number;
  roomId: string;
  roomCode: string | null;
}

export interface CancellationDto {
  id: string;
  date: string;
  reason: string;
  disruptionId: string | null;
  /** The class as published. */
  slot: TimetableSlotV1;
  makeUp: MakeUpDto | null;
}
