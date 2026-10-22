import { LONG_BREAK_MINUTES } from './constants';

/** A teaching period. Times are minutes from midnight. */
export interface BellPeriod {
  index: number;
  label: string;
  startMinute: number;
  endMinute: number;
}

export interface BellBreak {
  label: string;
  afterPeriodIndex: number;
  minutes: number;
}

export interface BellScheduleShape {
  workingDays: readonly number[];
  periods: readonly BellPeriod[];
  breaks: readonly BellBreak[];
}

/** "08:30" → 510. Returns null for anything that is not a valid 24-hour time. */
export function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 510 → "08:30" */
export function formatTime(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Builds evenly sized periods from a start time, with breaks inserted after the given
 * periods. Used by the bell schedule screen; the result can then be edited period by period.
 */
export function buildBellSchedule(args: {
  startMinute: number;
  periodMinutes: number;
  periodCount: number;
  breaks: readonly BellBreak[];
}): BellPeriod[] {
  const periods: BellPeriod[] = [];
  let at = args.startMinute;
  for (let index = 1; index <= args.periodCount; index++) {
    periods.push({
      index,
      label: `P${index}`,
      startMinute: at,
      endMinute: at + args.periodMinutes,
    });
    at += args.periodMinutes;
    for (const b of args.breaks) if (b.afterPeriodIndex === index) at += b.minutes;
  }
  return periods;
}

export interface BellProblem {
  code:
    | 'no_working_days'
    | 'no_periods'
    | 'period_too_short'
    | 'periods_out_of_order'
    | 'periods_overlap'
    | 'gap_without_break'
    | 'break_does_not_match_gap'
    | 'break_after_last_period'
    | 'ends_after_midnight';
  message: string;
}

/** Plain-language problems with a bell schedule; empty when it is usable. */
export function validateBellSchedule(schedule: BellScheduleShape): BellProblem[] {
  const problems: BellProblem[] = [];
  if (schedule.workingDays.length === 0) {
    problems.push({ code: 'no_working_days', message: 'Pick at least one working day.' });
  }
  const periods = [...schedule.periods].sort((a, b) => a.index - b.index);
  if (periods.length === 0) {
    problems.push({ code: 'no_periods', message: 'Add at least one period.' });
    return problems;
  }
  periods.forEach((p, i) => {
    if (p.index !== i + 1) {
      problems.push({
        code: 'periods_out_of_order',
        message: `Periods must be numbered 1, 2, 3 … without gaps (found ${p.label} as number ${p.index}).`,
      });
    }
    if (p.endMinute <= p.startMinute) {
      problems.push({ code: 'period_too_short', message: `${p.label} must end after it starts.` });
    }
    if (p.endMinute > 24 * 60) {
      problems.push({ code: 'ends_after_midnight', message: `${p.label} ends after midnight.` });
    }
  });
  const breaksAfter = new Map(schedule.breaks.map((b) => [b.afterPeriodIndex, b]));
  for (let i = 1; i < periods.length; i++) {
    const prev = periods[i - 1]!;
    const cur = periods[i]!;
    const gap = cur.startMinute - prev.endMinute;
    const brk = breaksAfter.get(prev.index);
    if (gap < 0) {
      problems.push({
        code: 'periods_overlap',
        message: `${cur.label} starts at ${formatTime(cur.startMinute)}, before ${prev.label} ends at ${formatTime(prev.endMinute)}.`,
      });
    } else if (gap > 0 && !brk) {
      problems.push({
        code: 'gap_without_break',
        message: `There is a ${gap}-minute gap after ${prev.label}. Add a break there or move ${cur.label}.`,
      });
    } else if (brk && brk.minutes !== gap) {
      problems.push({
        code: 'break_does_not_match_gap',
        message: `${brk.label} after ${prev.label} is ${brk.minutes} minutes, but ${cur.label} starts ${gap} minutes after ${prev.label} ends.`,
      });
    }
  }
  const last = periods[periods.length - 1]!;
  for (const b of schedule.breaks) {
    if (b.afterPeriodIndex >= last.index) {
      problems.push({
        code: 'break_after_last_period',
        message: `${b.label} comes after the last period. Remove it or add a period after it.`,
      });
    }
  }
  return problems;
}

/** Number of teaching periods in a week. */
export function periodsPerWeek(schedule: BellScheduleShape): number {
  return schedule.workingDays.length * schedule.periods.length;
}

/**
 * Periods where a block of `length` consecutive periods may start without crossing a long
 * break (≥ 30 minutes, e.g. lunch). Used for lab blocks.
 */
export function blockStarts(
  schedule: Pick<BellScheduleShape, 'periods' | 'breaks'>,
  length: number,
): number[] {
  const periods = [...schedule.periods].sort((a, b) => a.index - b.index);
  const longBreakAfter = new Set(
    schedule.breaks.filter((b) => b.minutes >= LONG_BREAK_MINUTES).map((b) => b.afterPeriodIndex),
  );
  const starts: number[] = [];
  for (let i = 0; i + length <= periods.length; i++) {
    let ok = true;
    for (let k = i; k < i + length - 1; k++) {
      const p = periods[k]!;
      const next = periods[k + 1]!;
      if (longBreakAfter.has(p.index) || next.startMinute - p.endMinute >= LONG_BREAK_MINUTES) {
        ok = false;
        break;
      }
    }
    if (ok) starts.push(periods[i]!.index);
  }
  return starts;
}
