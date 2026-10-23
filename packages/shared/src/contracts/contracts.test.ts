import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURE_CONTRACTS, loadFixture, type FixtureName } from '../fixtures';
import {
  EVENT_NAMES_V1,
  EVENTS_V1,
  NotificationRequestV1,
  parseEvent,
  ProvisionInstituteRequestV1,
  sessionLengths,
  SolverTimetableRequestV1,
  TimetableReadQueryV1,
} from './index';
import { solverJsonSchemas } from './json-schema';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const envelope = {
  eventId: id(1),
  occurredAt: '2026-10-22T09:30:00.000Z',
  instituteId: id(2),
  actorUserId: null,
};

describe('fixtures', () => {
  it.each(Object.keys(FIXTURE_CONTRACTS) as FixtureName[])('%s follows its contract', (name) => {
    expect(() => loadFixture(name)).not.toThrow();
  });

  it('solution, published timetable and today refer to the snapshot', () => {
    const snapshot = loadFixture('demo-term.snapshot.json');
    const solution = loadFixture('demo-term.solution.json');
    const published = loadFixture('demo-term.published-timetable.json');
    const today = loadFixture('demo-student.today.json');
    const assignments = new Set(snapshot.assignments.map((a) => a.id));
    const rooms = new Set(snapshot.rooms.map((r) => r.id));
    for (const p of [...solution.placed, ...solution.unplaced]) {
      expect(assignments.has(p.assignmentId)).toBe(true);
    }
    for (const p of solution.placed) expect(rooms.has(p.roomId)).toBe(true);
    expect(published.slots.length).toBeGreaterThan(0);
    for (const s of published.slots) expect(assignments.has(s.assignmentId)).toBe(true);
    const slotIds = new Set(published.slots.map((s) => s.id));
    for (const c of today.classes) expect(slotIds.has(c.id)).toBe(true);
  });

  it('seating response seats only requested students, never two of a paper side by side', () => {
    const request = loadFixture('demo-exam.seating-request.json');
    const response = loadFixture('demo-exam.seating-response.json');
    const students = new Map(request.students.map((s) => [s.id, s]));
    const at = new Map(response.seats.map((s) => [`${s.hallId}:${s.row}:${s.column}`, s.paperId]));
    for (const seat of response.seats) {
      expect(students.get(seat.studentId)?.paperId).toBe(seat.paperId);
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
      ] as const) {
        expect(at.get(`${seat.hallId}:${seat.row + dr}:${seat.column + dc}`)).not.toBe(
          seat.paperId,
        );
      }
    }
    expect(response.seats.length + response.unseated.length).toBe(request.students.length);
  });

  it('builds a valid solver request from the snapshot with defaults', () => {
    const request = SolverTimetableRequestV1.parse({
      version: 'solver-timetable.v1',
      requestId: 'job-1',
      snapshot: loadFixture('demo-term.snapshot.json'),
      options: {},
    });
    expect(request.options).toMatchObject({ timeLimitSeconds: 60, seed: 0, lockedSessions: [] });
  });
});

describe('solver JSON Schemas', () => {
  it.each(Object.entries(solverJsonSchemas()))(
    'services/solver/contracts/%s is up to date (run pnpm contracts:schemas)',
    (name, schema) => {
      const file = join(__dirname, '../../../../services/solver/contracts', name);
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(schema);
    },
  );
});

describe('events', () => {
  it('names a producer and consumers for every event', () => {
    expect(EVENT_NAMES_V1).toHaveLength(8);
    for (const name of EVENT_NAMES_V1) {
      expect(EVENTS_V1[name].producer).toBeTruthy();
      expect(EVENTS_V1[name].consumers.length).toBeGreaterThan(0);
    }
  });

  it('validates payloads', () => {
    const ok = parseEvent('term.activated', { ...envelope, termId: id(3), previousTermId: null });
    expect(ok.termId).toBe(id(3));
    expect(() => parseEvent('term.activated', { ...envelope })).toThrow();
    expect(() =>
      parseEvent('class.cancelled', {
        ...envelope,
        cancellationId: id(4),
        slotId: id(5),
        date: '2026-10-23',
        sectionIds: [id(6)],
        facultyIds: [],
        reason: 'Annual fest',
        disruptionId: null,
      }),
    ).not.toThrow();
  });
});

describe('other contracts', () => {
  it('timetable read query needs exactly one id', () => {
    expect(TimetableReadQueryV1.safeParse({ sectionId: id(1) }).success).toBe(true);
    expect(TimetableReadQueryV1.safeParse({}).success).toBe(false);
    expect(TimetableReadQueryV1.safeParse({ sectionId: id(1), roomId: id(2) }).success).toBe(false);
  });

  it('notification needs a recipient and fills defaults', () => {
    const base = {
      version: 'notify.v1',
      idempotencyKey: 'class.cancelled:abc',
      instituteId: id(1),
      templateKey: 'p4.classCancelled',
      data: { course: 'CS301 DS' },
    };
    expect(NotificationRequestV1.safeParse({ ...base, recipients: {} }).success).toBe(false);
    const ok = NotificationRequestV1.parse({ ...base, recipients: { sectionIds: [id(2)] } });
    expect(ok).toMatchObject({ channels: ['email'], priority: 'normal', sendAfter: null });
  });

  it('provisioning rejects reserved or malformed slugs', () => {
    const base = {
      version: 'institute-provisioning.v1',
      name: 'Demo Institute of Engineering',
      type: 'college',
      firstAdmin: { email: 'admin@demo.slotwise.test', name: 'Demo Admin' },
    };
    expect(ProvisionInstituteRequestV1.safeParse({ ...base, slug: 'demo-two' }).success).toBe(true);
    expect(ProvisionInstituteRequestV1.safeParse({ ...base, slug: 'www' }).success).toBe(false);
    expect(ProvisionInstituteRequestV1.safeParse({ ...base, slug: 'Demo' }).success).toBe(false);
  });

  it('splits practicals into lab blocks', () => {
    expect(sessionLengths(3, 'lecture', 2)).toEqual([1, 1, 1]);
    expect(sessionLengths(4, 'practical', 2)).toEqual([2, 2]);
    expect(sessionLengths(3, 'practical', 2)).toEqual([2, 1]);
  });
});
