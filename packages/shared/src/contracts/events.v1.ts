/**
 * Domain events v1, sent in-process with NestJS EventEmitter (`@nestjs/event-emitter`,
 * registered in app.module.ts). Streams talk to each other only through these and the other
 * contracts, never by importing each other's folders.
 *
 * Emit:   `this.events.emit(name, parseEvent(name, payload))` (EventEmitter2 injected).
 * Listen: `@OnEvent('timetable.published') handle(e: EventPayloadV1<'timetable.published'>)`.
 *
 * Every payload carries the envelope fields (eventId, occurredAt, instituteId, actorUserId).
 * Listeners must be idempotent (key on eventId) and must not throw back into the producer:
 * long work goes onto the listener's own BullMQ queue.
 */
import { z } from 'zod';
import { Id, IsoDate, IsoDateTime, Minute, PeriodIndex, ScopeV1 } from './common.v1';

export const EVENTS_V1_VERSION = 'events.v1' as const;

const Envelope = z.object({
  /** Unique per event; listeners de-duplicate on it. */
  eventId: Id,
  /** When it happened. */
  occurredAt: IsoDateTime,
  /** Tenant. Listeners must run their work inside this institute (withTenant). */
  instituteId: Id,
  /** User who caused it; null for system jobs. */
  actorUserId: Id.nullable(),
});

export const TimetablePublishedV1 = Envelope.extend({
  /** Term. */
  termId: Id,
  /** The version that is now published. */
  versionId: Id,
  /** The version it replaces (now archived), if any. */
  previousVersionId: Id.nullable(),
  /** Timetable scope, if the term has several. */
  scopeId: Id.nullable(),
  /** Sections whose timetable changed (all sections of the scope on first publish). */
  sectionIds: z.array(Id),
  /** First date the new version applies to. */
  validFrom: IsoDate,
});

export const TimetableVersionArchivedV1 = Envelope.extend({
  /** Term. */
  termId: Id,
  /** The version that was archived. */
  versionId: Id,
  /** The version replacing it, if any. */
  replacedByVersionId: Id.nullable(),
});

export const DisruptionCreatedV1 = Envelope.extend(ScopeV1.shape).extend({
  /** Disruption id (P4). */
  disruptionId: Id,
  /** What happened. */
  kind: z.enum(['holiday', 'event', 'faculty_leave', 'room_unavailable', 'other']),
  /** Plain-language title, e.g. "Annual fest". */
  title: z.string(),
  /** First affected date. */
  startDate: IsoDate,
  /** Last affected date (inclusive). */
  endDate: IsoDate,
  /** Start time on each day; null = whole day. */
  startMinute: Minute.nullable(),
  /** End time on each day; null = whole day. */
  endMinute: Minute.nullable(),
  /** For faculty_leave. */
  facultyId: Id.nullable(),
  /** For room_unavailable. */
  roomId: Id.nullable(),
});

export const ClassCancelledV1 = Envelope.extend({
  /** Cancellation id (P4). */
  cancellationId: Id,
  /** Published timetable slot (TimetableSlotV1.id) that is cancelled. */
  slotId: Id,
  /** Date of the cancelled class. */
  date: IsoDate,
  /** Sections whose students are affected. */
  sectionIds: z.array(Id),
  /** Teachers affected. */
  facultyIds: z.array(Id),
  /** Why, in plain words, e.g. "Annual fest". */
  reason: z.string(),
  /** The disruption that caused it, if any. */
  disruptionId: Id.nullable(),
});

export const MakeupApprovedV1 = Envelope.extend({
  /** Make-up id (P4). */
  makeUpId: Id,
  /** The cancellation it replaces. */
  cancellationId: Id,
  /** Date of the make-up class. */
  date: IsoDate,
  /** First period. */
  startPeriodIndex: PeriodIndex,
  /** Consecutive periods. */
  length: z.int().min(1),
  /** Start time, minutes from midnight. */
  startMinute: Minute,
  /** End time, minutes from midnight. */
  endMinute: Minute,
  /** Room. */
  roomId: Id,
  /** Teachers. */
  facultyIds: z.array(Id),
  /** Sections whose students attend. */
  sectionIds: z.array(Id),
});

export const ExamSeatingPublishedV1 = Envelope.extend({
  /** Seating plan id (P6). */
  seatingPlanId: Id,
  /** Exam session id (P6). */
  examSessionId: Id,
  /** Exam date. */
  date: IsoDate,
  /** e.g. "Morning". */
  sessionLabel: z.string(),
  /** Halls used. */
  roomIds: z.array(Id),
  /** Sections whose students have a seat in it. */
  sectionIds: z.array(Id),
});

export const InstituteCreatedV1 = Envelope.extend({
  /** Institute slug (subdomain). */
  slug: z.string(),
  /** Institute name. */
  name: z.string(),
  /** First institute admin. */
  firstAdminUserId: Id,
  /** Whether the sample data was loaded into it. */
  withSampleData: z.boolean(),
});

export const TermActivatedV1 = Envelope.extend({
  /** The term that is now active. */
  termId: Id,
  /** The term that was active before, if any (now closed or planning). */
  previousTermId: Id.nullable(),
});

/** Every event: payload schema, producer stream and consumer streams. */
export const EVENTS_V1 = {
  'timetable.published': {
    schema: TimetablePublishedV1,
    producer: 'P2T',
    consumers: ['P4', 'P5'],
  },
  'timetable.version.archived': {
    schema: TimetableVersionArchivedV1,
    producer: 'P2T',
    consumers: ['P4'],
  },
  'disruption.created': { schema: DisruptionCreatedV1, producer: 'P4', consumers: ['P4', 'P5'] },
  'class.cancelled': { schema: ClassCancelledV1, producer: 'P4', consumers: ['P4', 'P5'] },
  'makeup.approved': { schema: MakeupApprovedV1, producer: 'P4', consumers: ['P4', 'P5'] },
  'exam.seating.published': {
    schema: ExamSeatingPublishedV1,
    producer: 'P6',
    consumers: ['P4', 'P5'],
  },
  'institute.created': { schema: InstituteCreatedV1, producer: 'INT', consumers: ['P1', 'P7'] },
  'term.activated': { schema: TermActivatedV1, producer: 'P1', consumers: ['P2T', 'P4', 'P5'] },
} as const;

export type EventNameV1 = keyof typeof EVENTS_V1;
export type EventPayloadV1<N extends EventNameV1> = z.infer<(typeof EVENTS_V1)[N]['schema']>;
export const EVENT_NAMES_V1 = Object.keys(EVENTS_V1) as EventNameV1[];

/** Validates a payload before emitting (throws a ZodError on mismatch). */
export function parseEvent<N extends EventNameV1>(name: N, payload: unknown): EventPayloadV1<N> {
  return EVENTS_V1[name].schema.parse(payload) as EventPayloadV1<N>;
}
