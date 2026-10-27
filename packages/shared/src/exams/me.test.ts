import { describe, expect, it } from 'vitest';
import { floorName, todayIn } from './me';

describe('my exams helpers', () => {
  it('gives the date in the institute time zone', () => {
    // 20:00 UTC on 30 Nov is already 1 Dec in India.
    const now = new Date('2026-11-30T20:00:00Z');
    expect(todayIn('Asia/Kolkata', now)).toBe('2026-12-01');
    expect(todayIn('UTC', now)).toBe('2026-11-30');
  });

  it('names floors in plain words', () => {
    expect([0, 1, 2, 3, 4, 11, 21].map(floorName)).toEqual([
      'Ground floor',
      '1st floor',
      '2nd floor',
      '3rd floor',
      '4th floor',
      '11th floor',
      '21st floor',
    ]);
  });
});
