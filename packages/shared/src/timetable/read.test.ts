import { describe, expect, it } from 'vitest';
import { TimetableReadResponseV1, type TimetableSlotV1 } from '../contracts/timetable-read.v1';
import { demoPublishedTimetable, demoTermSnapshot, demoTermSolution } from '../fixtures';
import {
  readResponse,
  slotIsFor,
  timetableFor,
  toVersionV1,
  type StoredSlot,
  type StoredVersion,
} from './read';
import { slotsFromPlacements, SnapshotMismatchError, subGroupSections } from './slots';

const snapshot = demoTermSnapshot();
const solution = demoTermSolution();
const VERSION_ID = '00000000-0000-4000-8000-000000000001';

const stored: StoredSlot[] = slotsFromPlacements(snapshot, solution.placed).map((s, i) => ({
  ...s,
  id: `00000000-0000-4000-8000-${String(1000 + i).padStart(12, '0')}`,
  versionId: VERSION_ID,
}));

const published: StoredVersion = {
  id: VERSION_ID,
  termId: snapshot.term.id,
  scopeId: null,
  number: 1,
  status: 'published',
  publishedAt: new Date('2026-07-20T10:00:00.000Z'),
  publishedById: null,
  validFrom: new Date(`${snapshot.term.startDate}T00:00:00Z`),
  validTo: null,
};

/** A slot without its ids, for comparing with the fixture. */
const bare = ({ id: _id, versionId: _v, ...rest }: TimetableSlotV1) => JSON.stringify(rest);

describe('slotsFromPlacements', () => {
  it('keeps every placed session and copies names and times from the snapshot', () => {
    expect(stored).toHaveLength(solution.placed.length);
    const lab = stored.find((s) => s.component === 'practical' && s.length > 1)!;
    expect(lab.endMinute).toBeGreaterThan(lab.startMinute);
    expect(lab.faculty.map((f) => f.id)).toEqual(lab.facultyIds);
    expect(lab.roomCode).toBeTruthy();
  });

  it('refuses placements that refer to things outside the snapshot', () => {
    const [first] = solution.placed;
    const stray = { ...first!, roomId: '00000000-0000-4000-8000-00000000dead' };
    expect(() => slotsFromPlacements(snapshot, [stray])).toThrow(SnapshotMismatchError);
  });
});

describe('readResponse', () => {
  const fixture = demoPublishedTimetable();
  const sectionId = fixture.slots
    .map((s) => s.sectionIds)
    .reduce((acc, ids) => acc.filter((id) => ids.includes(id)))[0]!;

  it('gives the same section week as the published-timetable fixture', () => {
    const res = readResponse(published, stored, { kind: 'section', id: sectionId });
    expect(() => TimetableReadResponseV1.parse(res)).not.toThrow();
    expect(res.version).toEqual({
      ...fixture.version,
      id: VERSION_ID,
      validFrom: res.version!.validFrom,
    });
    expect(res.slots.map(bare).sort()).toEqual(fixture.slots.map(bare).sort());
  });

  it('lists slots in week order', () => {
    const res = readResponse(published, stored, { kind: 'section', id: sectionId });
    const keys = res.slots.map((s) => s.weekday * 100 + s.startPeriodIndex);
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
  });

  it("a sub-group sees its own and its section's classes, not the other sub-group's", () => {
    const groups = snapshot.subGroups.filter((g) => g.sectionId === sectionId);
    expect(groups.length).toBeGreaterThan(1);
    const [g1, g2] = groups;
    const res = readResponse(published, stored, { kind: 'subgroup', id: g1!.id }, sectionId);
    const kinds = new Set(res.slots.map((s) => s.target.kind));
    expect(kinds.has('section')).toBe(true);
    expect(res.slots.some((s) => s.target.id === g1!.id)).toBe(true);
    expect(res.slots.some((s) => s.target.id === g2!.id)).toBe(false);
    expect(subGroupSections(snapshot).get(g1!.id)).toBe(sectionId);
  });

  it('reads a faculty member and a room', () => {
    const someone = stored[0]!.facultyIds[0]!;
    const byFaculty = readResponse(published, stored, { kind: 'faculty', id: someone });
    expect(byFaculty.slots.length).toBeGreaterThan(0);
    expect(byFaculty.slots.every((s) => s.faculty.some((f) => f.id === someone))).toBe(true);

    const room = stored[0]!.roomId!;
    const byRoom = readResponse(published, stored, { kind: 'room', id: room });
    expect(byRoom.slots.every((s) => s.room?.id === room)).toBe(true);
  });

  it('is empty with no published version', () => {
    expect(readResponse(null, stored, { kind: 'section', id: sectionId })).toEqual({
      contract: 'timetable-read.v1',
      version: null,
      slots: [],
    });
  });
});

describe('helpers', () => {
  it('timetableFor picks the one id', () => {
    expect(timetableFor({ roomId: VERSION_ID })).toEqual({ kind: 'room', id: VERSION_ID });
  });

  it('a sub-group with an unknown section sees only its own classes', () => {
    const slot = {
      targetKind: 'section' as const,
      targetId: 's',
      sectionIds: ['s'],
      facultyIds: [],
      roomId: null,
    };
    expect(slotIsFor(slot, { kind: 'subgroup', id: 'g' })).toBe(false);
    expect(slotIsFor(slot, { kind: 'subgroup', id: 'g' }, 's')).toBe(true);
  });

  it('never exposes a draft', () => {
    expect(() => toVersionV1({ ...published, status: 'draft', number: null })).toThrow();
  });
});
