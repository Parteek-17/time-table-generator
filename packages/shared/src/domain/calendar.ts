/**
 * Calendar maths on plain dates ("YYYY-MM-DD", no time zone, as CLAUDE.md asks).
 * Internally a date is a day number (days since 1970-01-01), so there are no DST surprises.
 */
import { SATURDAY } from './constants';

export type IsoDate = string;

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-07-27" → day number. Throws on malformed input (validate with isIsoDate first). */
export function toDayNumber(date: IsoDate): number {
  const match = ISO_DATE.exec(date);
  if (!match) throw new Error(`Not a date: ${date}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS;
}

export function fromDayNumber(day: number): IsoDate {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  return fromDayNumber(toDayNumber(value)) === value;
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function weekdayOf(date: IsoDate | number): number {
  const day = typeof date === 'number' ? date : toDayNumber(date);
  // 1970-01-01 was a Thursday (4).
  return ((((day + 3) % 7) + 7) % 7) + 1;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromDayNumber(toDayNumber(date) + days);
}

export interface DateRange {
  startDate: IsoDate;
  /** Inclusive. */
  endDate: IsoDate;
}

function inRanges(day: number, ranges: readonly DateRange[]): boolean {
  return ranges.some((r) => day >= toDayNumber(r.startDate) && day <= toDayNumber(r.endDate));
}

export interface TeachingDaysInput {
  /** First teaching day of the cohort (its window's teaching start, or the term start). */
  teachingStart: IsoDate;
  /** Last teaching day: the day before preparatory holidays or end-sem exams, or term end. */
  teachingEnd: IsoDate;
  /** ISO weekdays from the bell schedule. */
  workingDays: readonly number[];
  holidays: readonly DateRange[];
  /** Mid-sem exam weeks, orientation, vacation, training: no regular teaching. */
  nonTeachingWindows: readonly DateRange[];
  /** Days that are teaching days although they are not usual working days. */
  extraWorkingDays: readonly IsoDate[];
}

/** Every teaching day in the range, in order. */
export function teachingDates(input: TeachingDaysInput): IsoDate[] {
  const extra = new Set(input.extraWorkingDays.map(toDayNumber));
  const working = new Set(input.workingDays);
  const dates: IsoDate[] = [];
  const end = toDayNumber(input.teachingEnd);
  for (let day = toDayNumber(input.teachingStart); day <= end; day++) {
    if (!working.has(weekdayOf(day)) && !extra.has(day)) continue;
    if (inRanges(day, input.holidays) || inRanges(day, input.nonTeachingWindows)) continue;
    dates.push(fromDayNumber(day));
  }
  return dates;
}

export function teachingDays(input: TeachingDaysInput): number {
  return teachingDates(input).length;
}

/**
 * The last teaching day of a cohort window: the day before preparatory holidays (or before
 * end-semester exams if there are none), capped at the term end.
 */
export function teachingEndFor(args: {
  termEnd: IsoDate;
  prepHolidaysStart?: IsoDate | null;
  endSemExamStart?: IsoDate | null;
}): IsoDate {
  const cut = args.prepHolidaysStart ?? args.endSemExamStart;
  if (!cut) return args.termEnd;
  const dayBefore = addDays(cut, -1);
  return toDayNumber(dayBefore) < toDayNumber(args.termEnd) ? dayBefore : args.termEnd;
}

export interface WorkingSaturday {
  date: IsoDate;
  /** Weekday whose timetable this Saturday follows, rotating so no weekday falls behind. */
  followsWeekday: number;
}

/**
 * Saturdays to make working days to cover a shortfall, spread evenly across the term.
 * Returns fewer than asked if there are not enough free Saturdays.
 */
export function suggestWorkingSaturdays(
  input: TeachingDaysInput,
  shortfall: number,
): WorkingSaturday[] {
  if (shortfall <= 0 || input.workingDays.includes(SATURDAY)) return [];
  const extra = new Set(input.extraWorkingDays.map(toDayNumber));
  const free: number[] = [];
  const end = toDayNumber(input.teachingEnd);
  for (let day = toDayNumber(input.teachingStart); day <= end; day++) {
    if (weekdayOf(day) !== SATURDAY || extra.has(day)) continue;
    if (inRanges(day, input.holidays) || inRanges(day, input.nonTeachingWindows)) continue;
    free.push(day);
  }
  const count = Math.min(shortfall, free.length);
  const weekdays = [...input.workingDays].filter((d) => d !== SATURDAY).sort((a, b) => a - b);
  const picked: WorkingSaturday[] = [];
  for (let i = 0; i < count; i++) {
    // Evenly spaced picks: the middle of each of `count` equal slices of the free Saturdays.
    const at = Math.floor(((i + 0.5) * free.length) / count);
    picked.push({
      date: fromDayNumber(free[at]!),
      followsWeekday: weekdays.length > 0 ? weekdays[i % weekdays.length]! : 1,
    });
  }
  return picked;
}

export interface HolidayLine {
  name: string;
  startDate: IsoDate;
  endDate: IsoDate;
}

export type HolidayParseResult =
  | { ok: true; line: number; holiday: HolidayLine }
  | { ok: false; line: number; text: string; message: string };

/**
 * Parses pasted holiday lines (wizard step 10):
 *   2026-10-20, Dussehra
 *   2026-11-07 to 2026-11-10, Diwali break
 *   2026-11-07 - 2026-11-10, Diwali break
 * Blank lines are ignored. Each line reports its own error in plain words.
 */
export function parseHolidayLines(text: string): HolidayParseResult[] {
  const results: HolidayParseResult[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.trim();
    if (!line) return;
    const comma = line.indexOf(',');
    if (comma < 0) {
      results.push({
        ok: false,
        line: lineNo,
        text: line,
        message: 'Add a comma and the holiday name, e.g. "2026-10-20, Dussehra".',
      });
      return;
    }
    const datePart = line.slice(0, comma).trim();
    const name = line.slice(comma + 1).trim();
    const range = /^(\d{4}-\d{2}-\d{2})(?:\s*(?:to|–|-)\s*(\d{4}-\d{2}-\d{2}))?$/i.exec(datePart);
    if (!range || !isIsoDate(range[1]!) || (range[2] && !isIsoDate(range[2]))) {
      results.push({
        ok: false,
        line: lineNo,
        text: line,
        message: `"${datePart}" is not a date. Use YYYY-MM-DD, e.g. 2026-10-20.`,
      });
      return;
    }
    if (!name) {
      results.push({
        ok: false,
        line: lineNo,
        text: line,
        message: 'Add the holiday name after the comma.',
      });
      return;
    }
    const startDate = range[1]!;
    const endDate = range[2] ?? startDate;
    if (toDayNumber(endDate) < toDayNumber(startDate)) {
      results.push({
        ok: false,
        line: lineNo,
        text: line,
        message: 'The end date is before the start date.',
      });
      return;
    }
    results.push({ ok: true, line: lineNo, holiday: { name, startDate, endDate } });
  });
  return results;
}
