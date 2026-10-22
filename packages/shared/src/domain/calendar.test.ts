import { describe, expect, it } from 'vitest';
import {
  addDays,
  isIsoDate,
  parseHolidayLines,
  suggestWorkingSaturdays,
  teachingDates,
  teachingDays,
  teachingEndFor,
  weekdayOf,
  type TeachingDaysInput,
} from './calendar';

const MON_FRI = [1, 2, 3, 4, 5];

const base = (over: Partial<TeachingDaysInput> = {}): TeachingDaysInput => ({
  teachingStart: '2026-07-27',
  teachingEnd: '2026-08-07',
  workingDays: MON_FRI,
  holidays: [],
  nonTeachingWindows: [],
  extraWorkingDays: [],
  ...over,
});

describe('dates', () => {
  it('weekdays are ISO (Monday = 1)', () => {
    expect(weekdayOf('2026-07-27')).toBe(1);
    expect(weekdayOf('2026-08-01')).toBe(6);
    expect(weekdayOf('2026-08-02')).toBe(7);
    expect(weekdayOf('1970-01-01')).toBe(4);
    expect(weekdayOf('1969-12-29')).toBe(1);
  });

  it('validates and adds days across months and leap years', () => {
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-7-1')).toBe(false);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('teaching days', () => {
  it('counts working days in the range, inclusive', () => {
    expect(teachingDays(base())).toBe(10);
    expect(teachingDates(base())[0]).toBe('2026-07-27');
  });

  it('subtracts holidays and non-teaching windows', () => {
    const input = base({
      holidays: [{ startDate: '2026-07-29', endDate: '2026-07-29' }],
      nonTeachingWindows: [{ startDate: '2026-08-03', endDate: '2026-08-05' }],
    });
    expect(teachingDays(input)).toBe(6);
  });

  it('adds extra working days, unless they fall on a holiday', () => {
    expect(teachingDays(base({ extraWorkingDays: ['2026-08-01'] }))).toBe(11);
    expect(
      teachingDays(
        base({
          extraWorkingDays: ['2026-08-01'],
          holidays: [{ startDate: '2026-08-01', endDate: '2026-08-01' }],
        }),
      ),
    ).toBe(10);
  });

  it('ends the day before preparatory holidays, or end-sem exams, capped at term end', () => {
    expect(
      teachingEndFor({
        termEnd: '2026-12-31',
        prepHolidaysStart: '2026-11-23',
        endSemExamStart: '2026-12-01',
      }),
    ).toBe('2026-11-22');
    expect(teachingEndFor({ termEnd: '2026-12-31', endSemExamStart: '2026-12-01' })).toBe(
      '2026-11-30',
    );
    expect(teachingEndFor({ termEnd: '2026-11-15', endSemExamStart: '2026-12-01' })).toBe(
      '2026-11-15',
    );
    expect(teachingEndFor({ termEnd: '2026-12-31' })).toBe('2026-12-31');
  });

  it('suggests evenly spread free Saturdays with rotating weekdays', () => {
    const input = base({
      teachingEnd: '2026-09-30',
      holidays: [{ startDate: '2026-08-15', endDate: '2026-08-15' }], // a Saturday
    });
    const picks = suggestWorkingSaturdays(input, 3);
    expect(picks).toHaveLength(3);
    for (const p of picks) expect(weekdayOf(p.date)).toBe(6);
    expect(picks.map((p) => p.date)).not.toContain('2026-08-15');
    expect(picks.map((p) => p.followsWeekday)).toEqual([1, 2, 3]);
    // Making them working days closes the gap.
    const after = teachingDays({ ...input, extraWorkingDays: picks.map((p) => p.date) });
    expect(after).toBe(teachingDays(input) + 3);
  });

  it('no suggestions when Saturday is already a working day or nothing is short', () => {
    expect(suggestWorkingSaturdays(base({ workingDays: [1, 2, 3, 4, 5, 6] }), 5)).toEqual([]);
    expect(suggestWorkingSaturdays(base(), 0)).toEqual([]);
  });

  it('returns only as many Saturdays as exist', () => {
    expect(suggestWorkingSaturdays(base(), 10)).toHaveLength(1); // only 1 Aug in range
  });
});

describe('parseHolidayLines', () => {
  it('reads single days and ranges, skips blank lines', () => {
    const results = parseHolidayLines(
      '2026-10-20, Dussehra\n\n2026-11-07 to 2026-11-10, Diwali break\n2026-12-25 - 2026-12-25,Christmas',
    );
    expect(results).toEqual([
      {
        ok: true,
        line: 1,
        holiday: { name: 'Dussehra', startDate: '2026-10-20', endDate: '2026-10-20' },
      },
      {
        ok: true,
        line: 3,
        holiday: { name: 'Diwali break', startDate: '2026-11-07', endDate: '2026-11-10' },
      },
      {
        ok: true,
        line: 4,
        holiday: { name: 'Christmas', startDate: '2026-12-25', endDate: '2026-12-25' },
      },
    ]);
  });

  it('explains bad lines in plain words', () => {
    const results = parseHolidayLines(
      '20/10/2026, Dussehra\n2026-10-20\n2026-11-10 to 2026-11-07, Backwards\n2026-02-30, Nope',
    );
    expect(results.map((r) => r.ok)).toEqual([false, false, false, false]);
    const messages = results.map((r) => (r.ok ? '' : r.message));
    expect(messages[0]).toContain('is not a date');
    expect(messages[1]).toContain('Add a comma');
    expect(messages[2]).toContain('before the start date');
    expect(messages[3]).toContain('is not a date');
  });
});
