import { describe, expect, it } from 'vitest';
import { busySlotsFrom, GenerateTimetableInput } from './generate';

const slot = {
  sectionIds: ['sec-a'],
  facultyIds: ['fac-1', 'fac-2'],
  roomId: 'lab-1',
  weekday: 2,
  startPeriod: 5,
  length: 2,
};

describe('busySlotsFrom', () => {
  it('marks every period of a lab block for its section, teachers and room', () => {
    const busy = busySlotsFrom([slot], new Set(), 'CSE timetable (published)');
    expect(busy).toHaveLength(2 * 4);
    expect(busy).toContainEqual({
      resource: 'room',
      id: 'lab-1',
      weekday: 2,
      periodIndex: 6,
      reason: 'CSE timetable (published)',
    });
  });

  it('skips classes of the sections being timetabled now', () => {
    expect(busySlotsFrom([slot], new Set(['sec-a']), 'x')).toEqual([]);
  });

  it('lists each cell once', () => {
    const shared = { ...slot, sectionIds: ['sec-b'], roomId: null, length: 1 };
    const busy = busySlotsFrom([shared, shared], new Set(), 'x');
    expect(busy).toHaveLength(3);
  });
});

describe('GenerateTimetableInput', () => {
  it('fills defaults', () => {
    expect(GenerateTimetableInput.parse({})).toEqual({
      scopeId: null,
      timeLimitSeconds: 60,
      seed: 0,
    });
  });

  it('refuses a time limit over ten minutes', () => {
    expect(GenerateTimetableInput.safeParse({ timeLimitSeconds: 601 }).success).toBe(false);
  });
});
