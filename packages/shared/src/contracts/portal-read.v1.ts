/**
 * Portal "Today" v1: what a student or faculty member sees first (CLAUDE.md "Role-shaped
 * home screens"): next class, today's classes and changes, exam seat.
 *
 * `GET /portal/today?date=YYYY-MM-DD` on the API (date defaults to today in the institute's
 * time zone), relative to API_URL. Producer: P5 (built from TimetableReadResponseV1 plus
 * P4's cancellations/make-ups and P6's seats). Consumer: P5 web (phones first).
 * Fixture: `demoStudentToday()`.
 */
import { z } from 'zod';
import { ComponentV1, Id, IsoDate, Minute, PeriodIndex } from './common.v1';

export const PORTAL_READ_V1 = 'portal-read.v1' as const;

export const TodayClassV1 = z.object({
  /** Published slot id, or the make-up id when kind is makeup. */
  id: Id,
  /** regular class, or a make-up added for today. */
  kind: z.enum(['regular', 'makeup']),
  /** True when cancelled today (still listed, struck through, with the reason). */
  cancelled: z.boolean(),
  /** Why it was cancelled, in plain words; null if not cancelled. */
  cancelReason: z.string().nullable(),
  /** First period. */
  startPeriodIndex: PeriodIndex,
  /** Consecutive periods. */
  length: z.int().min(1),
  /** Start, minutes from midnight (institute time zone). */
  startMinute: Minute,
  /** End, minutes from midnight. */
  endMinute: Minute,
  /** lecture, tutorial or practical. */
  component: ComponentV1,
  /** e.g. "CS301". */
  courseCode: z.string(),
  /** e.g. "DS". */
  courseShortName: z.string(),
  /** Full title. */
  courseTitle: z.string(),
  /** Room code, e.g. "G16"; null if none. */
  roomCode: z.string().nullable(),
  /** For students: teachers' names. For faculty: the group taught, e.g. "CS A-G1". */
  withWhom: z.string(),
});

export const TodayChangeV1 = z.object({
  /** What changed. */
  kind: z.enum(['cancelled', 'makeup', 'room_changed', 'teacher_changed', 'holiday']),
  /** One plain-language line, e.g. "CS301 DS at 10:50 is cancelled: Annual fest". */
  message: z.string(),
  /** The class it is about, if any (TodayClassV1.id). */
  classId: Id.nullable(),
});

export const ExamSeatV1 = z.object({
  /** Exam date. */
  date: IsoDate,
  /** e.g. "Morning". */
  sessionLabel: z.string(),
  /** Reporting time, minutes from midnight. */
  reportingMinute: Minute,
  /** e.g. "CS301". */
  paperCode: z.string(),
  /** Paper title. */
  paperTitle: z.string(),
  /** Hall code, e.g. "G16". */
  hallCode: z.string(),
  /** Building name. */
  building: z.string(),
  /** 0 = ground floor. */
  floor: z.int(),
  /** Seat label, e.g. "G16-R3-C2". */
  seatLabel: z.string(),
});

export const TodayV1 = z.object({
  /** Always "portal-read.v1". */
  contract: z.literal(PORTAL_READ_V1),
  /** The day shown. */
  date: IsoDate,
  /** Institute time zone, e.g. "Asia/Kolkata". */
  timezone: z.string(),
  /** Who is looking. */
  viewer: z.object({
    /** student or faculty. */
    role: z.enum(['student', 'faculty']),
    /** Student or faculty id. */
    id: Id,
    /** Their name. */
    name: z.string(),
    /** Students: section display name, e.g. "CS A". Faculty: short code. */
    groupLabel: z.string(),
  }),
  /** Today is a holiday or non-teaching day: its name; null on teaching days. */
  holiday: z.string().nullable(),
  /** The next class from now that is not cancelled; null if none left today. */
  nextClassId: Id.nullable(),
  /** Today's classes in time order (cancelled ones included). */
  classes: z.array(TodayClassV1),
  /** Changes to today and the next 7 days, newest first. */
  changes: z.array(TodayChangeV1),
  /** The next exam seat within 14 days, if any. */
  examSeat: ExamSeatV1.nullable(),
});

export type TodayClassV1 = z.infer<typeof TodayClassV1>;
export type TodayChangeV1 = z.infer<typeof TodayChangeV1>;
export type ExamSeatV1 = z.infer<typeof ExamSeatV1>;
export type TodayV1 = z.infer<typeof TodayV1>;

export const PORTAL_TODAY_V1_ROUTE = '/portal/today' as const;
