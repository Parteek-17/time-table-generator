/**
 * Generating a timetable: the API's input and output shapes, and the cells other published
 * timetables already occupy (busySlots for the solver).
 */
import { z } from 'zod';
import type { BusySlotV1 } from '../contracts/solver-timetable.v1';
import type { SlotRecord } from './slots';

/** `POST /terms/:termId/timetable/generate`. */
export const GenerateTimetableInput = z.object({
  /** Timetable scope (P1's TimetableScope); null or missing = every running cohort of the term. */
  scopeId: z.uuid().nullable().default(null),
  /** Stop the solver after this many seconds and keep the best timetable found. */
  timeLimitSeconds: z.int().min(5).max(600).default(60),
  /** Same input + seed → same timetable. */
  seed: z.int().min(0).default(0),
  /**
   * Re-solve the rest: start from this version, keep its locked classes where they are and
   * place everything else again. The new draft's parent is this version; its scope wins.
   */
  baseVersionId: z.uuid().nullable().default(null),
});
export type GenerateTimetableInput = z.infer<typeof GenerateTimetableInput>;

export const SOLVE_JOB_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const;
export type SolveJobStatus = (typeof SOLVE_JOB_STATUSES)[number];

/** What the solver did, kept on the job. */
export interface SolveSummary {
  /** OPTIMAL, FEASIBLE, INFEASIBLE or TIMEOUT. */
  solverStatus: string;
  placed: number;
  unplaced: number;
  solveSeconds: number;
  scoreTotal: number;
}

/** A solve job as the API returns it (`GET /timetable/jobs/:jobId`). */
export interface SolveJobDto {
  id: string;
  termId: string;
  scopeId: string | null;
  status: SolveJobStatus;
  /** 0–100. */
  progress: number;
  /** Draft version it produced, once succeeded. */
  versionId: string | null;
  summary: SolveSummary | null;
  /** Plain-language reason, when failed. */
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/** A version in the list editors see (`GET /terms/:termId/timetable/versions`). */
export interface VersionSummaryDto {
  id: string;
  termId: string;
  scopeId: string | null;
  status: 'draft' | 'published' | 'archived';
  /** Set once published. */
  number: number | null;
  parentId: string | null;
  solveJobId: string | null;
  slotCount: number;
  unplacedCount: number;
  createdAt: string;
  publishedAt: string | null;
}

type BusyFields = Pick<
  SlotRecord,
  'sectionIds' | 'facultyIds' | 'roomId' | 'weekday' | 'startPeriod' | 'length'
>;

/**
 * Cells that other published timetables already use, for the solver's `busySlots`: every
 * period of every slot, for its sections, teachers and room. Slots whose sections are being
 * timetabled now (`ownSectionIds`) are left out — the new timetable replaces them.
 */
export function busySlotsFrom(
  slots: readonly BusyFields[],
  ownSectionIds: ReadonlySet<string>,
  reason: string,
): BusySlotV1[] {
  const seen = new Set<string>();
  const out: BusySlotV1[] = [];
  const add = (
    resource: BusySlotV1['resource'],
    id: string,
    weekday: number,
    periodIndex: number,
  ) => {
    const key = `${resource}:${id}:${weekday}:${periodIndex}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ resource, id, weekday, periodIndex, reason });
  };
  for (const slot of slots) {
    if (slot.sectionIds.some((id) => ownSectionIds.has(id))) continue;
    for (let p = slot.startPeriod; p < slot.startPeriod + slot.length; p++) {
      for (const id of slot.sectionIds) add('section', id, slot.weekday, p);
      for (const id of slot.facultyIds) add('faculty', id, slot.weekday, p);
      if (slot.roomId) add('room', slot.roomId, slot.weekday, p);
    }
  }
  return out;
}
