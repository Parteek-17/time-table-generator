/**
 * The exam seat on "Today" (portal-read.v1 `examSeat`), read from P6's `GET /exams/me`.
 *
 * That route is not a frozen contract yet (requests/2026-10-27-p5-exam-seat-contract.md), so
 * P5 keeps its own schema of just the fields it reads: if P6 changes the shape, parsing fails
 * and Today shows no seat rather than a wrong one.
 */
import { z } from 'zod';
import type { ExamSeatV1 } from '../contracts';
import { addDays } from './calendar';

export const MY_EXAMS_ROUTE = '/exams/me' as const;

/** Days ahead the next seat is shown on Today (portal-read.v1: "within 14 days"). */
export const EXAM_SEAT_DAYS_AHEAD = 14;

/** P5's view of P6's `MyExamsDto.seats[]`. */
export const MyExamSeatAdapter = z.object({
  date: z.iso.date(),
  sessionLabel: z.string(),
  startMinute: z.int().min(0).max(1440),
  paperCode: z.string(),
  paperTitle: z.string(),
  hallCode: z.string(),
  building: z.string().nullable(),
  floor: z.int().nullable(),
  seatLabel: z.string(),
});

/** P5's view of P6's `MyExamsDto`. */
export const MyExamsAdapter = z.object({
  seats: z.array(MyExamSeatAdapter),
});
export type MyExamsAdapter = z.infer<typeof MyExamsAdapter>;

/**
 * The soonest seat from `today` to 14 days ahead, as portal-read.v1's ExamSeatV1. P6 gives
 * the session's start, not a separate reporting time, so `reportingMinute` is the start.
 * Seats whose hall no longer exists (no building or floor) are skipped.
 */
export function examSeatFrom(mine: MyExamsAdapter, today: string): ExamSeatV1 | null {
  const last = addDays(today, EXAM_SEAT_DAYS_AHEAD);
  const next = mine.seats
    .filter((s) => s.date >= today && s.date <= last && s.building !== null && s.floor !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute)[0];
  if (!next) return null;
  return {
    date: next.date,
    sessionLabel: next.sessionLabel,
    reportingMinute: next.startMinute,
    paperCode: next.paperCode,
    paperTitle: next.paperTitle,
    hallCode: next.hallCode,
    building: next.building ?? '',
    floor: next.floor ?? 0,
    seatLabel: next.seatLabel,
  };
}

/** "Ground floor", "1st floor", "2nd floor" … */
export function floorName(floor: number): string {
  if (floor === 0) return 'Ground floor';
  const tens = floor % 100;
  const suffix =
    tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[floor % 10] ?? 'th');
  return `${floor}${suffix} floor`;
}
