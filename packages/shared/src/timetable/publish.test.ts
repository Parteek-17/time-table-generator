import { describe, expect, it } from 'vitest';
import { changedSections, dateIn, dayBefore, publishValidFrom } from './publish';

const slot = (over: Partial<Parameters<typeof changedSections>[1][number]> = {}) => ({
  sessionId: 'a#1',
  sectionIds: ['s1'],
  weekday: 1,
  startPeriodIndex: 1,
  length: 1,
  roomId: 'r1',
  facultyIds: ['f1'],
  ...over,
});

describe('changedSections', () => {
  it('lists every section on a first publish', () => {
    expect(changedSections(null, [slot()], ['s2', 's1', 's2'])).toEqual(['s1', 's2']);
  });

  it('is empty when nothing moved', () => {
    expect(changedSections([slot()], [slot()], ['s1'])).toEqual([]);
  });

  it('finds moved, re-roomed, re-staffed, added and removed classes', () => {
    const before = [
      slot(),
      slot({ sessionId: 'b#1', sectionIds: ['s2'] }),
      slot({ sessionId: 'c#1', sectionIds: ['s3'] }),
      slot({ sessionId: 'd#1', sectionIds: ['s4'] }),
      slot({ sessionId: 'e#1', sectionIds: ['s5'] }),
    ];
    const after = [
      slot({ weekday: 2 }),
      slot({ sessionId: 'b#1', sectionIds: ['s2'], roomId: 'r2' }),
      slot({ sessionId: 'c#1', sectionIds: ['s3'], facultyIds: ['f2'] }),
      slot({ sessionId: 'e#1', sectionIds: ['s5'] }),
      slot({ sessionId: 'f#1', sectionIds: ['s6', 's7'] }),
    ];
    expect(changedSections(before, after, [])).toEqual(['s1', 's2', 's3', 's4', 's6', 's7']);
  });
});

describe('dates', () => {
  it('reads today in the institute timezone', () => {
    // 20:00 UTC is already the next day in India.
    expect(dateIn(new Date('2026-10-26T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-10-27');
    expect(dateIn(new Date('2026-10-26T20:00:00Z'), 'UTC')).toBe('2026-10-26');
  });

  it('steps back a day across months', () => {
    expect(dayBefore('2026-11-01')).toBe('2026-10-31');
  });

  it('keeps the start date inside the term', () => {
    expect(publishValidFrom('2026-07-01', '2026-07-27', '2026-11-30')).toBe('2026-07-27');
    expect(publishValidFrom('2026-10-26', '2026-07-27', '2026-11-30')).toBe('2026-10-26');
    expect(publishValidFrom('2026-12-10', '2026-07-27', '2026-11-30')).toBe('2026-11-30');
  });
});
