/**
 * Published timetable read API v1, for rescheduling (P4), portals (P5) and exams (P6).
 *
 * `GET /terms/:termId/timetable?sectionId=…` (or `subGroupId`, `facultyId`, `roomId`;
 * exactly one) on the API, relative to API_URL. Optional `versionId` reads an older
 * published or archived version; default is the version currently published.
 * Producer: P2T. Consumers: P4, P5, P6. Fixture: `demoPublishedTimetable()`.
 *
 * Faculty and students may read published timetables only (CLAUDE.md roles); drafts never
 * appear here.
 */
import { z } from 'zod';
import {
  ComponentV1,
  Id,
  IsoDate,
  IsoDateTime,
  Minute,
  PeriodIndex,
  TargetKindV1,
  Weekday,
} from './common.v1';

export const TIMETABLE_READ_V1 = 'timetable-read.v1' as const;

/** Query: exactly one of the four ids. */
export const TimetableReadQueryV1 = z
  .object({
    /** A section's week, including its sub-group and elective classes. */
    sectionId: Id.optional(),
    /** One sub-group's week (its own classes plus its section's whole-section classes). */
    subGroupId: Id.optional(),
    /** One faculty member's week. */
    facultyId: Id.optional(),
    /** One room's week. */
    roomId: Id.optional(),
    /** A specific version; default: the published one. */
    versionId: Id.optional(),
  })
  .refine((q) => [q.sectionId, q.subGroupId, q.facultyId, q.roomId].filter(Boolean).length === 1, {
    message: 'Pass exactly one of sectionId, subGroupId, facultyId or roomId.',
  });

export const TimetableVersionV1 = z.object({
  /** Version id. */
  id: Id,
  /** Term id. */
  termId: Id,
  /** Timetable scope (e.g. "Main"), if the term has several. */
  scopeId: Id.nullable(),
  /** 1, 2, 3 … per scope; increases with every publish. */
  number: z.int().min(1),
  /** draft → published → archived. This API returns published or archived only. */
  status: z.enum(['published', 'archived']),
  /** When it was published. */
  publishedAt: IsoDateTime,
  /** Who published it (user id). */
  publishedById: Id.nullable(),
  /** First date it applies to. */
  validFrom: IsoDate,
  /** Last date it applies to (inclusive); null = until the term ends or a newer version. */
  validTo: IsoDate.nullable(),
});

export const TimetableSlotV1 = z.object({
  /** Slot id (stable within a version; cancellations and make-ups refer to it). */
  id: Id,
  /** Version it belongs to. */
  versionId: Id,
  /** ISO weekday. */
  weekday: Weekday,
  /** First period. */
  startPeriodIndex: PeriodIndex,
  /** Consecutive periods (1, or a lab block). */
  length: z.int().min(1),
  /** Start time of the first period, minutes from midnight. */
  startMinute: Minute,
  /** End time of the last period, minutes from midnight. */
  endMinute: Minute,
  /** Teaching assignment it came from. */
  assignmentId: Id,
  /** lecture, tutorial or practical. */
  component: ComponentV1,
  /** Course. */
  course: z.object({
    /** Course id. */
    id: Id,
    /** e.g. "CS301". */
    code: z.string(),
    /** e.g. "DS". */
    shortName: z.string(),
    /** Full title. */
    title: z.string(),
  }),
  /** Audience. */
  target: z.object({
    /** section, subgroup or elective_section. */
    kind: TargetKindV1,
    /** Its id. */
    id: Id,
    /** e.g. "CS A", "CS A-G1", "ML-1". */
    name: z.string(),
  }),
  /** Every regular section whose students attend (for notices and portals). */
  sectionIds: z.array(Id),
  /** Teachers. */
  faculty: z.array(
    z.object({
      /** Faculty id. */
      id: Id,
      /** Display name. */
      name: z.string(),
      /** e.g. "VT". */
      shortCode: z.string(),
    }),
  ),
  /** Room, or null if not assigned. */
  room: z
    .object({
      /** Room id. */
      id: Id,
      /** e.g. "G16". */
      code: z.string(),
    })
    .nullable(),
});

export const TimetableReadResponseV1 = z.object({
  /** Always "timetable-read.v1". */
  contract: z.literal(TIMETABLE_READ_V1),
  /** The version read, or null when nothing is published yet for this term. */
  version: TimetableVersionV1.nullable(),
  /** Slots for the requested section / sub-group / faculty / room, by weekday and period. */
  slots: z.array(TimetableSlotV1),
});

export type TimetableReadQueryV1 = z.infer<typeof TimetableReadQueryV1>;
export type TimetableVersionV1 = z.infer<typeof TimetableVersionV1>;
export type TimetableSlotV1 = z.infer<typeof TimetableSlotV1>;
export type TimetableReadResponseV1 = z.infer<typeof TimetableReadResponseV1>;

export const TIMETABLE_READ_V1_ROUTE = '/terms/:termId/timetable' as const;
