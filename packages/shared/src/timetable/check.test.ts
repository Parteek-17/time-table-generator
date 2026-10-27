import { describe, expect, it } from 'vitest';
import type { SetupSnapshotV1 } from '../contracts/setup-snapshot.v1';
import { demoTermSnapshot, demoTermSolution } from '../fixtures';
import { problemText, TimetableChecker, type EditorSlot } from './check';
import { toSlotV1 } from './read';
import { slotsFromPlacements } from './slots';

const snapshot = demoTermSnapshot();
const slots: EditorSlot[] = slotsFromPlacements(snapshot, demoTermSolution().placed).map(
  (s, i) => ({
    ...toSlotV1({ ...s, id: `slot-${i}`, versionId: 'v' }),
    sessionId: s.sessionId,
    locked: false,
  }),
);
const checker = (snap: SetupSnapshotV1 = snapshot, list = slots) =>
  new TimetableChecker(snap, list);
const at = (s: EditorSlot) => ({ weekday: s.weekday, startPeriodIndex: s.startPeriodIndex });
const codes = (plan: ReturnType<TimetableChecker['plan']>) =>
  plan.ok ? [] : plan.problems.map((p) => p.code);
const clone = (): SetupSnapshotV1 => structuredClone(snapshot);

const lecture = slots.find((s) => s.component === 'lecture' && s.target.kind === 'section')!;
const lab = slots.find((s) => s.component === 'practical' && s.length >= 2)!;

describe('TimetableChecker.plan', () => {
  it('lets a class stay where it is, in its own room', () => {
    expect(checker().plan(lecture.id, at(lecture))).toEqual({
      ok: true,
      roomId: lecture.room!.id,
      roomCode: lecture.room!.code,
      roomChanged: false,
    });
  });

  it('refuses a time when the section already has a class, naming it', () => {
    const other = slots.find(
      (s) =>
        s.id !== lecture.id &&
        s.target.id === lecture.target.id &&
        (s.weekday !== lecture.weekday || s.startPeriodIndex !== lecture.startPeriodIndex),
    )!;
    const plan = checker().plan(lecture.id, at(other));
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.problems).toContainEqual(
        expect.objectContaining({
          code: 'section_busy',
          params: expect.objectContaining({ who: other.target.name, code: other.course.code }),
        }),
      );
    }
  });

  it('refuses a time when the teacher is teaching another class', () => {
    // Any two classes of one teacher for different sections.
    const pair = slots
      .flatMap((a) =>
        slots
          .filter(
            (b) =>
              b.id !== a.id &&
              b.faculty.some((f) => a.faculty.some((x) => x.id === f.id)) &&
              !b.sectionIds.some((id) => a.sectionIds.includes(id)),
          )
          .map((b) => [a, b] as const),
      )
      .at(0);
    expect(pair).toBeDefined();
    const [a, b] = pair!;
    expect(codes(checker().plan(a.id, at(b)))).toContain('faculty_busy');
  });

  it('never moves a locked class', () => {
    const locked = slots.map((s) => (s.id === lecture.id ? { ...s, locked: true } : s));
    expect(codes(checker(snapshot, locked).plan(lecture.id, at(lecture)))).toEqual(['locked']);
  });

  it('refuses days off and a lab that runs past the last period', () => {
    expect(codes(checker().plan(lecture.id, { weekday: 7, startPeriodIndex: 1 }))).toEqual([
      'not_working_day',
    ]);
    const last = Math.max(...snapshot.bellSchedules[0]!.periods.map((p) => p.index));
    expect(codes(checker().plan(lab.id, { weekday: lab.weekday, startPeriodIndex: last }))).toEqual(
      ['outside_day'],
    );
  });

  it('refuses a lab block across a long break', () => {
    const bell = snapshot.bellSchedules[0]!;
    const long = bell.breaks.find((b) => b.minutes >= 30)!;
    const plan = checker().plan(lab.id, {
      weekday: lab.weekday,
      startPeriodIndex: long.afterPeriodIndex,
    });
    expect(codes(plan)).toContain('crosses_break');
  });

  it('lets two lab groups of one section meet at the same time', () => {
    const groups = slots.filter((s) => s.target.kind === 'subgroup');
    const pair = groups
      .flatMap((a) =>
        groups
          .filter(
            (b) =>
              b.id !== a.id &&
              b.target.id !== a.target.id &&
              b.sectionIds[0] === a.sectionIds[0] &&
              b.length === a.length,
          )
          .map((b) => [a, b] as const),
      )
      .at(0);
    expect(pair).toBeDefined();
    const [a, b] = pair!;
    expect(codes(checker().plan(a.id, at(b)))).not.toContain('section_busy');
  });

  it('respects teacher unavailability, day limits and fixed slots', () => {
    const teacher = lecture.faculty[0]!.id;
    const free = checker()
      .validStarts(lecture.id)
      .find((c) => c.weekday !== lecture.weekday)!;
    expect(free).toBeDefined();

    const unavailable = clone();
    unavailable.faculty
      .find((f) => f.id === teacher)!
      .unavailable.push({
        weekday: free.weekday,
        periodIndex: free.startPeriodIndex,
      });
    expect(codes(checker(unavailable).plan(lecture.id, free))).toContain('faculty_unavailable');

    const limited = clone();
    const taughtThatDay = slots
      .filter((s) => s.weekday === free.weekday && s.faculty.some((f) => f.id === teacher))
      .reduce((n, s) => n + s.length, 0);
    limited.faculty.find((f) => f.id === teacher)!.maxPeriodsPerDay = Math.max(taughtThatDay, 1);
    if (taughtThatDay > 0) {
      expect(codes(checker(limited).plan(lecture.id, free))).toContain('faculty_day_limit');
    }

    const fixed = clone();
    fixed.fixedSlots.push({
      id: '00000000-0000-4000-8000-0000000000f1',
      scopeType: 'institute',
      departmentId: null,
      programmeId: null,
      cohortId: null,
      sectionId: null,
      kind: 'library',
      label: 'Library hour',
      weekday: free.weekday,
      startPeriodIndex: free.startPeriodIndex,
      endPeriodIndex: free.startPeriodIndex,
      facultyIds: [],
    });
    const plan = checker(fixed).plan(lecture.id, free);
    expect(plan.ok ? [] : plan.problems).toContainEqual({
      code: 'fixed_slot',
      params: { label: 'Library hour' },
    });
  });

  it('moves the class to another suitable room when its own is taken', () => {
    // Put another class into this lecture's room at a free time for the lecture.
    const free = checker()
      .validStarts(lecture.id)
      .find((c) => c.weekday !== lecture.weekday)!;
    const intruder = slots.find(
      (s) => s.id !== lecture.id && s.component === 'lecture' && s.length === 1,
    )!;
    const moved = slots.map((s) =>
      s.id === intruder.id ? { ...s, ...free, room: lecture.room } : s,
    );
    const plan = checker(snapshot, moved).plan(lecture.id, free);
    if (plan.ok) {
      expect(plan.roomChanged).toBe(true);
      expect(plan.roomId).not.toBe(lecture.room!.id);
    } else {
      expect(codes(plan)).not.toContain('no_free_room');
    }
  });

  it('knows a busy cell from another published timetable', () => {
    const free = checker().validStarts(lecture.id)[0]!;
    const busy = new TimetableChecker(snapshot, slots, [
      {
        resource: 'faculty',
        id: lecture.faculty[0]!.id,
        weekday: free.weekday,
        periodIndex: free.startPeriodIndex,
        reason: 'ECE timetable (published)',
      },
    ]);
    expect(codes(busy.plan(lecture.id, free))).toContain('busy_elsewhere');
  });
});

describe('TimetableChecker.validStarts', () => {
  it('includes where the class is now, and every start passes plan()', () => {
    const c = checker();
    const starts = c.validStarts(lab.id);
    expect(starts).toContainEqual(at(lab));
    expect(starts.every((to) => c.plan(lab.id, to).ok)).toBe(true);
  });
});

describe('problemText', () => {
  it('writes a plain sentence', () => {
    expect(
      problemText({
        code: 'faculty_busy',
        params: { name: 'Ms. Rao', who: 'CS B', code: 'CS302', periods: 'P3' },
      }),
    ).toBe('Ms. Rao teaches CS B (CS302) in P3.');
  });
});
