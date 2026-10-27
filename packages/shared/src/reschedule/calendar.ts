/**
 * Which dates a published class actually meets on: its weekday, inside the term and the
 * cohort's teaching window, not on a holiday or non-teaching window from the setup calendar,
 * with Saturdays that "follow Monday" (extra working days) counted. Built from the setup
 * snapshot (setup-snapshot.v1); pure.
 */
import type { ScopeV1, SetupSnapshotV1, TimetableSlotV1 } from '../contracts';
import { addDays, eachDate, isoWeekday } from './dates';

/** Where a section sits, for matching scoped holidays and disruptions. */
export interface SectionPlace {
  departmentId: string;
  programmeId: string;
  cohortId: string;
  /** First and last teaching day of its cohort this term. */
  teachingFrom: string;
  teachingTo: string;
}

export interface DayOff extends ScopeV1 {
  name: string;
  startDate: string;
  endDate: string;
}

export interface ExtraWorkingDay extends ScopeV1 {
  date: string;
  followsWeekday: number;
}

export interface RescheduleCalendar {
  termStart: string;
  termEnd: string;
  timezone: string;
  sections: ReadonlyMap<string, SectionPlace>;
  /** Holidays and non-teaching windows (exams, vacation, …) from setup. */
  daysOff: readonly DayOff[];
  extraWorkingDays: readonly ExtraWorkingDay[];
}

/** The calendar of a term, from its setup snapshot. */
export function calendarFromSnapshot(snapshot: SetupSnapshotV1): RescheduleCalendar {
  const { term } = snapshot;
  const cohorts = new Map(snapshot.cohorts.map((c) => [c.id, c]));
  const sections = new Map<string, SectionPlace>();
  for (const section of snapshot.sections) {
    const cohort = cohorts.get(section.cohortId);
    if (!cohort) continue;
    const window = snapshot.cohortWindows.find(
      (w) =>
        w.programmeId === cohort.programmeId &&
        (w.semesters.length === 0 || w.semesters.includes(cohort.semester)) &&
        (w.entryType === null || w.entryType === cohort.entryType),
    );
    const from =
      window && window.teachingStart > term.startDate ? window.teachingStart : term.startDate;
    // Teaching ends the day before preparation holidays start.
    const prep = window?.prepHolidaysStart;
    const to = prep && prep <= term.endDate ? addDays(prep, -1) : term.endDate;
    sections.set(section.id, {
      departmentId: cohort.departmentId,
      programmeId: cohort.programmeId,
      cohortId: cohort.id,
      teachingFrom: from,
      teachingTo: to,
    });
  }
  const daysOff: DayOff[] = [
    ...snapshot.holidays.map(({ id: _id, ...h }) => h),
    ...snapshot.calendarWindows.map(({ id: _id, type: _type, label, ...w }) => ({
      ...w,
      name: label,
    })),
  ];
  return {
    termStart: term.startDate,
    termEnd: term.endDate,
    timezone: snapshot.timezone,
    sections,
    daysOff,
    extraWorkingDays: snapshot.extraWorkingDays.map(({ id: _id, ...d }) => d),
  };
}

/** True if a setup-calendar scope (institute, department, programme, cohort, section) covers the section. */
export function scopeCoversSection(
  scope: ScopeV1,
  sectionId: string,
  place: SectionPlace | undefined,
): boolean {
  switch (scope.scopeType) {
    case 'institute':
      return true;
    case 'department':
      return place?.departmentId === scope.departmentId;
    case 'programme':
      return place?.programmeId === scope.programmeId;
    case 'cohort':
      return place?.cohortId === scope.cohortId;
    case 'section':
      return scope.sectionId === sectionId;
  }
}

/** Weekday whose timetable runs on `date` for these sections (an extra working day follows another). */
export function timetableWeekday(
  date: string,
  sectionIds: readonly string[],
  cal: RescheduleCalendar,
): number {
  const extra = cal.extraWorkingDays.find(
    (d) => d.date === date && sectionIds.some((s) => scopeCoversSection(d, s, cal.sections.get(s))),
  );
  return extra ? extra.followsWeekday : isoWeekday(date);
}

/** The setup holiday or window that keeps these sections off on `date`, if any. */
export function dayOffOn(
  date: string,
  sectionIds: readonly string[],
  cal: RescheduleCalendar,
): DayOff | null {
  return (
    cal.daysOff.find(
      (off) =>
        off.startDate <= date &&
        date <= off.endDate &&
        sectionIds.some((s) => scopeCoversSection(off, s, cal.sections.get(s))),
    ) ?? null
  );
}

/** True if any of the sections is in its teaching window on `date`. */
export function isTeachingDay(
  date: string,
  sectionIds: readonly string[],
  cal: RescheduleCalendar,
): boolean {
  if (date < cal.termStart || date > cal.termEnd) return false;
  if (sectionIds.length === 0) return true;
  return sectionIds.some((s) => {
    const place = cal.sections.get(s);
    return !place || (place.teachingFrom <= date && date <= place.teachingTo);
  });
}

/** Part of a published version a class belongs to: the dates it applies to. */
export interface VersionWindow {
  validFrom: string;
  /** Inclusive; null = until the term ends. */
  validTo: string | null;
}

type SlotDates = Pick<TimetableSlotV1, 'weekday' | 'sectionIds'>;

/** True if the class meets on `date` (weekday, term, teaching window, not a day off). */
export function classMeetsOn(
  slot: SlotDates,
  date: string,
  version: VersionWindow,
  cal: RescheduleCalendar,
): boolean {
  if (date < version.validFrom || (version.validTo !== null && date > version.validTo)) {
    return false;
  }
  if (!isTeachingDay(date, slot.sectionIds, cal)) return false;
  if (timetableWeekday(date, slot.sectionIds, cal) !== slot.weekday) return false;
  return dayOffOn(date, slot.sectionIds, cal) === null;
}

/** Every date from `from` to `to` on which the class meets. */
export function classDates(
  slot: SlotDates,
  from: string,
  to: string,
  version: VersionWindow,
  cal: RescheduleCalendar,
): string[] {
  return eachDate(from, to).filter((date) => classMeetsOn(slot, date, version, cal));
}
