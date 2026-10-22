import { describe, expect, it } from 'vitest';
import {
  blockStarts,
  buildBellSchedule,
  formatTime,
  parseTime,
  periodsPerWeek,
  validateBellSchedule,
} from './bell';
import { DEFAULT_BELL, defaultLoad } from './constants';
import {
  activeComponents,
  classCapacity,
  componentPeriods,
  credits,
  formatLtp,
  groupingFor,
  roomFits,
  roomNeedFor,
  weeklyPeriods,
  type SchedulableCourse,
} from './courses';
import { sectionNames, splitEvenly, subGroupNames, subGroupsAddUp } from './groups';

const course = (over: Partial<SchedulableCourse> = {}): SchedulableCourse => ({
  lectures: 3,
  tutorials: 1,
  practicals: 2,
  type: 'core',
  isScheduled: true,
  tutorialBy: 'subgroup',
  practicalBy: 'subgroup',
  ...over,
});

describe('courses', () => {
  it('credits = L + T + P/2 unless overridden', () => {
    expect(credits({ lectures: 3, tutorials: 1, practicals: 2 })).toBe(5);
    expect(credits({ lectures: 0, tutorials: 0, practicals: 3 })).toBe(1.5);
    expect(credits({ lectures: 3, tutorials: 0, practicals: 0, creditsOverride: 2 })).toBe(2);
    expect(credits({ lectures: 3, tutorials: 0, practicals: 0, creditsOverride: 0 })).toBe(0);
  });

  it('periods per component and per week', () => {
    const c = course();
    expect(formatLtp(c)).toBe('3-1-2');
    expect(componentPeriods(c, 'lecture')).toBe(3);
    expect(componentPeriods(c, 'practical')).toBe(2);
    expect(weeklyPeriods(c)).toBe(6);
    expect(activeComponents(course({ tutorials: 0 }))).toEqual(['lecture', 'practical']);
  });

  it('MOOCs and other unscheduled courses take no periods', () => {
    const mooc = course({ type: 'mooc', isScheduled: false });
    expect(weeklyPeriods(mooc)).toBe(0);
    expect(activeComponents(mooc)).toEqual([]);
  });

  it('lectures are always by section; T and P follow the course', () => {
    const c = course({ tutorialBy: 'section' });
    expect(groupingFor(c, 'lecture')).toBe('section');
    expect(groupingFor(c, 'tutorial')).toBe('section');
    expect(groupingFor(c, 'practical')).toBe('subgroup');
  });

  it('room needs and fits', () => {
    const lab = { type: 'lab' as const, labCategories: ['Software lab'] };
    const hall = { type: 'lecture' as const, labCategories: [] };
    const need = roomNeedFor({ roomType: null, labCategory: 'software LAB' }, 'practical');
    expect(need).toEqual({ type: 'lab', labCategory: 'software LAB' });
    expect(roomFits(lab, need)).toBe(true);
    expect(roomFits({ type: 'lab', labCategories: ['Hardware lab'] }, need)).toBe(false);
    expect(roomFits(hall, roomNeedFor({ roomType: null, labCategory: null }, 'tutorial'))).toBe(
      true,
    );
    expect(
      roomFits(hall, roomNeedFor({ roomType: 'drawing_hall', labCategory: null }, 'practical')),
    ).toBe(false);
    expect(roomNeedFor({ roomType: 'drawing_hall', labCategory: 'x' }, 'lecture')).toEqual({
      type: 'lecture',
      labCategory: null,
    });
  });

  it('class capacity = rows × seats unless overridden', () => {
    expect(classCapacity({ rows: 10, seatsPerRow: 6, capacityOverride: null })).toBe(60);
    expect(classCapacity({ rows: 10, seatsPerRow: 6, capacityOverride: 72 })).toBe(72);
    expect(classCapacity({ rows: null, seatsPerRow: null, capacityOverride: null })).toBe(0);
  });

  it('default load by experience', () => {
    expect(defaultLoad('experienced')).toEqual({ maxPeriodsPerDay: 4, maxPeriodsPerWeek: 14 });
    expect(defaultLoad('fresher')).toEqual({ maxPeriodsPerDay: 5, maxPeriodsPerWeek: 18 });
  });
});

describe('bell schedule', () => {
  const seedBell = {
    workingDays: [1, 2, 3, 4, 5],
    periods: buildBellSchedule({
      startMinute: parseTime('08:30')!,
      periodMinutes: 60,
      periodCount: 8,
      breaks: [{ label: 'Lunch', afterPeriodIndex: 3, minutes: 60 }],
    }),
    breaks: [{ label: 'Lunch', afterPeriodIndex: 3, minutes: 60 }],
  };

  it('time parsing and formatting', () => {
    expect(parseTime('08:30')).toBe(510);
    expect(parseTime('8:05')).toBe(485);
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('9.30')).toBeNull();
    expect(formatTime(510)).toBe('08:30');
  });

  it('builds 08:30–17:30 with lunch 11:30–12:30', () => {
    const p = seedBell.periods;
    expect(p.map((x) => `${formatTime(x.startMinute)}-${formatTime(x.endMinute)}`)).toEqual([
      '08:30-09:30',
      '09:30-10:30',
      '10:30-11:30',
      '12:30-13:30',
      '13:30-14:30',
      '14:30-15:30',
      '15:30-16:30',
      '16:30-17:30',
    ]);
    expect(validateBellSchedule(seedBell)).toEqual([]);
    expect(periodsPerWeek(seedBell)).toBe(40);
  });

  it('the CLAUDE.md default is valid', () => {
    const periods = buildBellSchedule(DEFAULT_BELL);
    expect(periods[0]!.startMinute).toBe(540);
    expect(
      validateBellSchedule({
        workingDays: DEFAULT_BELL.workingDays,
        periods,
        breaks: DEFAULT_BELL.breaks,
      }),
    ).toEqual([]);
  });

  it('explains gaps, overlaps and mismatched breaks', () => {
    const periods = [
      { index: 1, label: 'P1', startMinute: 540, endMinute: 590 },
      { index: 2, label: 'P2', startMinute: 600, endMinute: 650 },
      { index: 3, label: 'P3', startMinute: 640, endMinute: 690 },
    ];
    const codes = validateBellSchedule({ workingDays: [], periods, breaks: [] }).map((p) => p.code);
    expect(codes).toEqual(['no_working_days', 'gap_without_break', 'periods_overlap']);
    const mismatch = validateBellSchedule({
      workingDays: [1],
      periods: periods.slice(0, 2),
      breaks: [{ label: 'Tea', afterPeriodIndex: 1, minutes: 15 }],
    });
    expect(mismatch.map((p) => p.code)).toEqual(['break_does_not_match_gap']);
    expect(mismatch[0]!.message).toContain('Tea after P1 is 15 minutes');
  });

  it('lab blocks never cross lunch', () => {
    expect(blockStarts(seedBell, 2)).toEqual([1, 2, 4, 5, 6, 7]);
    expect(blockStarts(seedBell, 3)).toEqual([1, 4, 5, 6]);
    expect(blockStarts(seedBell, 5)).toEqual([4]);
    expect(blockStarts(seedBell, 6)).toEqual([]);
  });

  it('a short break does not split a lab block', () => {
    const breaks = [{ label: 'Tea', afterPeriodIndex: 2, minutes: 10 }];
    const periods = buildBellSchedule({
      startMinute: 540,
      periodMinutes: 50,
      periodCount: 4,
      breaks,
    });
    expect(blockStarts({ periods, breaks }, 2)).toEqual([1, 2, 3]);
  });
});

describe('groups', () => {
  it('splits strength evenly, larger parts first', () => {
    expect(splitEvenly(61, 2)).toEqual([31, 30]);
    expect(splitEvenly(60, 3)).toEqual([20, 20, 20]);
    expect(splitEvenly(10, 0)).toEqual([]);
  });

  it('names sections and sub-groups', () => {
    expect(sectionNames(3)).toEqual(['A', 'B', 'C']);
    expect(sectionNames(28).slice(-3)).toEqual(['Z', 'AA', 'AB']);
    expect(subGroupNames('A', 2)).toEqual(['A1', 'A2']);
  });

  it('sub-group strengths must add up', () => {
    expect(subGroupsAddUp(60, [30, 30])).toBe(true);
    expect(subGroupsAddUp(60, [30, 29])).toBe(false);
    expect(subGroupsAddUp(60, [])).toBe(true);
  });
});
