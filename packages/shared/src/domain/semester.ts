/**
 * Which semester a batch is in during a term, and which semesters run in a term.
 *
 * A session starting in year S has an odd term (Jul–Dec, semesters 1, 3, 5 …) and an even
 * term (Jan–Jun, semesters 2, 4, 6 …). A regular batch admitted in year Y is in semester
 * 2 × (S − Y) + 1 in the odd term and one more in the even term. Lateral-entry students
 * start at the programme's lateral-entry semester (3 for B.Tech LEET) in the year they join.
 */

export type TermKind = 'odd' | 'even';
export type EntryType = 'regular' | 'lateral';

export interface TermRef {
  /** First calendar year of the academic session: 2026 for "2026-27". */
  sessionStartYear: number;
  kind: TermKind;
}

export interface BatchRef {
  admissionYear: number;
  entryType: EntryType;
}

export interface ProgrammeRef {
  totalSemesters: number;
  /** Null when the programme has no lateral entry. */
  lateralEntrySemester: number | null;
}

/** The semester students start in: 1, or the lateral-entry semester. Null if not possible. */
export function firstSemester(batch: BatchRef, programme: ProgrammeRef): number | null {
  if (batch.entryType === 'regular') return 1;
  return programme.lateralEntrySemester;
}

/**
 * Semester of a batch in a term, before any admin override. Null when the batch has not
 * started yet or is past the programme's final semester (no cohort is created).
 */
export function semesterFor(
  batch: BatchRef,
  programme: ProgrammeRef,
  term: TermRef,
): number | null {
  const first = firstSemester(batch, programme);
  if (first == null) return null;
  // Students start in the odd term if their first semester is odd, else in the even term.
  const startsInOddTerm = first % 2 === 1;
  const yearsIn = term.sessionStartYear - batch.admissionYear;
  const termOffset = term.kind === 'odd' ? 0 : 1;
  const semester = first + 2 * yearsIn + termOffset - (startsInOddTerm ? 0 : 1);
  if (semester < first || semester > programme.totalSemesters) return null;
  return semester;
}

/** Year of study for a semester: semesters 1–2 are year 1, 3–4 year 2 … */
export function yearOfStudy(semester: number): number {
  return Math.ceil(semester / 2);
}

/** Semesters of a programme that run in a term of this kind: odd → 1, 3, 5 …; even → 2, 4 … */
export function runningSemesters(
  programme: Pick<ProgrammeRef, 'totalSemesters'>,
  kind: TermKind,
): number[] {
  const result: number[] = [];
  for (let s = kind === 'odd' ? 1 : 2; s <= programme.totalSemesters; s += 2) result.push(s);
  return result;
}

/** The term after this one: odd → even of the same session; even → odd of the next. */
export function nextTerm(term: TermRef): TermRef {
  return term.kind === 'odd'
    ? { sessionStartYear: term.sessionStartYear, kind: 'even' }
    : { sessionStartYear: term.sessionStartYear + 1, kind: 'odd' };
}

/** "2026-27" for 2026. */
export function sessionName(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** Default term label: "July–Dec 2026" or "Jan–June 2027". Editable. */
export function defaultTermLabel(term: TermRef): string {
  return term.kind === 'odd'
    ? `July–Dec ${term.sessionStartYear}`
    : `Jan–June ${term.sessionStartYear + 1}`;
}

/**
 * Default cohort display code: "CSE S3" for undergraduate branches, "MBA S1" for
 * programmes without branches, "MTECH CSE S1" for postgraduate branches (so it does not
 * clash with B.Tech CSE). Departments rename it to their own style ("D2 CSE").
 */
export function defaultCohortCode(args: {
  programmeCode: string;
  programmeLevel: 'ug' | 'pg' | 'diploma' | 'doctoral';
  branchCode: string;
  isDefaultBranch: boolean;
  semester: number;
  entryType: EntryType;
}): string {
  const name = args.isDefaultBranch
    ? args.programmeCode
    : args.programmeLevel === 'ug'
      ? args.branchCode
      : `${args.programmeCode} ${args.branchCode}`;
  return `${name} S${args.semester}${args.entryType === 'lateral' ? ' LEET' : ''}`;
}
