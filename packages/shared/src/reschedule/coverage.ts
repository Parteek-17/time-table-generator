/**
 * Syllabus coverage (CLAUDE.md "Rescheduling"): delivered periods = scheduled − lost (+ made
 * up) against the course's syllabus hours; warn below 100 %, flag below 90 %. One period counts
 * as one contact hour. Pure.
 *
 * Rows are per course and audience, as students see it: a section (its whole-section classes
 * plus the classes of one lab group — the one with the fewest, so the row is fair to every
 * group) or an elective section.
 */
import { z } from 'zod';
import { Id, type TimetableSlotV1 } from '../contracts';
import { classDates, type RescheduleCalendar, type VersionWindow } from './calendar';

export const COVERAGE_WARN_BELOW = 1;
export const COVERAGE_FLAG_BELOW = 0.9;

export type CoverageStatus = 'ok' | 'warn' | 'flag' | 'unknown';

export interface CoverageCancellation {
  slot: TimetableSlotV1;
  date: string;
  periods: number;
  /** Its make-up, if booked. */
  makeUp: { date: string; length: number } | null;
}

export interface CoverageRow {
  course: TimetableSlotV1['course'];
  /** Who the row is for: a section, or an elective section. */
  audience: { kind: 'section' | 'elective_section'; id: string; name: string };
  /** Contact hours the scheme asks for; null when the scheme doesn't say. */
  syllabusHours: number | null;
  /** Periods the published timetable gives in the whole term (setup holidays left out). */
  scheduled: number;
  /** Periods cancelled. */
  lost: number;
  /** Periods given back by make-ups. */
  madeUp: number;
  /** scheduled − lost + madeUp: what the term will deliver if nothing else changes. */
  delivered: number;
  /** Delivered up to and including today. */
  heldSoFar: number;
  /** delivered / syllabusHours, rounded to whole percent; null without syllabus hours. */
  percent: number | null;
  status: CoverageStatus;
}

export function coverageStatus(delivered: number, syllabusHours: number | null): CoverageStatus {
  if (!syllabusHours) return 'unknown';
  const ratio = delivered / syllabusHours;
  if (ratio < COVERAGE_FLAG_BELOW) return 'flag';
  if (ratio < COVERAGE_WARN_BELOW) return 'warn';
  return 'ok';
}

interface Tally {
  scheduled: number;
  lost: number;
  madeUp: number;
  heldSoFar: number;
}

const empty = (): Tally => ({ scheduled: 0, lost: 0, madeUp: 0, heldSoFar: 0 });

/** Row key and the part of it a class belongs to ("" = whole audience, else a lab group id). */
function placeOf(slot: TimetableSlotV1): {
  key: string;
  part: string;
  audience: CoverageRow['audience'];
} {
  if (slot.target.kind === 'elective_section') {
    return {
      key: `${slot.course.id} ${slot.target.id}`,
      part: '',
      audience: { kind: 'elective_section', id: slot.target.id, name: slot.target.name },
    };
  }
  const sectionId = slot.target.kind === 'section' ? slot.target.id : slot.sectionIds[0]!;
  return {
    key: `${slot.course.id} ${sectionId}`,
    part: slot.target.kind === 'subgroup' ? slot.target.id : '',
    // Lab-group classes name the group ("CS A-G1"); the section's own classes name it.
    audience: {
      kind: 'section',
      id: sectionId,
      name: slot.target.kind === 'section' ? slot.target.name : '',
    },
  };
}

export function syllabusCoverage(input: {
  slots: readonly TimetableSlotV1[];
  version: VersionWindow;
  cal: RescheduleCalendar;
  cancellations: readonly CoverageCancellation[];
  /** courseId → contact hours. */
  syllabusHours: ReadonlyMap<string, number | null>;
  /** Section names for rows that only have lab-group classes. */
  sectionNames: ReadonlyMap<string, string>;
  today: string;
}): CoverageRow[] {
  const { cal, version, today } = input;
  const rows = new Map<
    string,
    { course: CoverageRow['course']; audience: CoverageRow['audience']; parts: Map<string, Tally> }
  >();
  const tally = (slot: TimetableSlotV1) => {
    const { key, part, audience } = placeOf(slot);
    let row = rows.get(key);
    if (!row) {
      row = { course: slot.course, audience, parts: new Map() };
      rows.set(key, row);
    }
    if (!row.audience.name && audience.name) row.audience = audience;
    let t = row.parts.get(part);
    if (!t) row.parts.set(part, (t = empty()));
    return t;
  };

  for (const slot of input.slots) {
    const t = tally(slot);
    for (const date of classDates(slot, cal.termStart, cal.termEnd, version, cal)) {
      t.scheduled += slot.length;
      if (date <= today) t.heldSoFar += slot.length;
    }
  }
  for (const c of input.cancellations) {
    const t = tally(c.slot);
    t.lost += c.periods;
    if (c.date <= today) t.heldSoFar -= c.periods;
    if (c.makeUp) {
      t.madeUp += c.makeUp.length;
      if (c.makeUp.date <= today) t.heldSoFar += c.makeUp.length;
    }
  }

  const out: CoverageRow[] = [];
  for (const row of rows.values()) {
    const whole = row.parts.get('') ?? empty();
    const groups = [...row.parts].filter(([part]) => part !== '').map(([, t]) => t);
    // The lab group with the fewest delivered periods speaks for the section.
    const group = groups.sort((a, b) => delivered(a) - delivered(b))[0] ?? empty();
    const sum = (k: keyof Tally) => whole[k] + group[k];
    const syllabusHours = input.syllabusHours.get(row.course.id) ?? null;
    const total = sum('scheduled') - sum('lost') + sum('madeUp');
    out.push({
      course: row.course,
      audience: row.audience.name
        ? row.audience
        : { ...row.audience, name: input.sectionNames.get(row.audience.id) ?? '' },
      syllabusHours,
      scheduled: sum('scheduled'),
      lost: sum('lost'),
      madeUp: sum('madeUp'),
      delivered: total,
      heldSoFar: sum('heldSoFar'),
      percent: syllabusHours ? Math.round((total / syllabusHours) * 100) : null,
      status: coverageStatus(total, syllabusHours),
    });
  }
  const rank: Record<CoverageStatus, number> = { flag: 0, warn: 1, unknown: 2, ok: 3 };
  return out.sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      (a.percent ?? 0) - (b.percent ?? 0) ||
      a.audience.name.localeCompare(b.audience.name) ||
      a.course.code.localeCompare(b.course.code),
  );
}

function delivered(t: Tally): number {
  return t.scheduled - t.lost + t.madeUp;
}

/** Which rows: one section, one department's sections, or (neither) every section. */
export const CoverageQuery = z
  .object({ sectionId: Id.optional(), departmentId: Id.optional() })
  .refine((q) => !(q.sectionId && q.departmentId), {
    message: 'Choose a section or a department, not both.',
  });
export type CoverageQuery = z.infer<typeof CoverageQuery>;

export interface CoverageDto {
  /** Today in the institute's time zone ("held so far" counts up to it). */
  today: string;
  /** Flagged first, then warnings, then the rest. */
  rows: CoverageRow[];
}
