/**
 * "Promote batches": after a term closes, create next term's cohorts one semester up,
 * copying sections and sub-groups. Pure preview; the API commits what the admin confirms.
 */
import { defaultCohortCode, yearOfStudy, type EntryType } from './semester';

export interface PromoteSourceCohort {
  cohortId: string;
  batchId: string;
  displayCode: string;
  semester: number;
  /** Lateral-entry cohort sitting in another batch's sections. */
  joinsBatchId: string | null;
  entryType: EntryType;
  totalSemesters: number;
  programmeCode: string;
  programmeLevel: 'ug' | 'pg' | 'diploma' | 'doctoral';
  branchCode: string;
  isDefaultBranch: boolean;
  sections: readonly {
    name: string;
    displayName: string;
    strength: number;
    homeRoomId: string | null;
    subGroups: readonly { name: string; strength: number }[];
  }[];
}

export interface PromoteRow {
  batchId: string;
  fromCohortId: string;
  fromDisplayCode: string;
  fromSemester: number;
  /** Null when the batch has finished its final semester. */
  toSemester: number | null;
  action: 'promote' | 'graduate' | 'already_exists';
  toDisplayCode: string | null;
  /** True when a custom code (e.g. "D2 CSE") may need a new year number. */
  displayCodeNeedsReview: boolean;
  joinsBatchId: string | null;
  sections: PromoteSourceCohort['sections'];
}

/**
 * One row per source cohort. Batches that already have a cohort in the next term are left
 * alone (re-running promote is safe).
 */
export function promotePreview(
  cohorts: readonly PromoteSourceCohort[],
  batchesWithCohortInNextTerm: ReadonlySet<string>,
): PromoteRow[] {
  return cohorts.map((c): PromoteRow => {
    const base = {
      batchId: c.batchId,
      fromCohortId: c.cohortId,
      fromDisplayCode: c.displayCode,
      fromSemester: c.semester,
      joinsBatchId: c.joinsBatchId,
    };
    const toSemester = c.semester + 1;
    if (toSemester > c.totalSemesters) {
      return {
        ...base,
        toSemester: null,
        action: 'graduate',
        toDisplayCode: null,
        displayCodeNeedsReview: false,
        sections: [],
      };
    }
    const codeArgs = {
      programmeCode: c.programmeCode,
      programmeLevel: c.programmeLevel,
      branchCode: c.branchCode,
      isDefaultBranch: c.isDefaultBranch,
      entryType: c.entryType,
    };
    const usedDefault = c.displayCode === defaultCohortCode({ ...codeArgs, semester: c.semester });
    const toDisplayCode = usedDefault
      ? defaultCohortCode({ ...codeArgs, semester: toSemester })
      : c.displayCode;
    return {
      ...base,
      toSemester,
      action: batchesWithCohortInNextTerm.has(c.batchId) ? 'already_exists' : 'promote',
      toDisplayCode,
      displayCodeNeedsReview: !usedDefault && yearOfStudy(toSemester) !== yearOfStudy(c.semester),
      sections: c.joinsBatchId ? [] : c.sections,
    };
  });
}
