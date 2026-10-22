/**
 * Holidays, calendar windows, extra working days and fixed slots apply to a scope:
 * the whole institute, a department, a programme, a cohort or one section.
 */

export type CalendarScopeType = 'institute' | 'department' | 'programme' | 'cohort' | 'section';

export interface ScopedRow {
  scopeType: CalendarScopeType;
  departmentId?: string | null;
  programmeId?: string | null;
  cohortId?: string | null;
  sectionId?: string | null;
}

/** Where a cohort or section sits, for matching scoped rows. */
export interface ScopeTarget {
  departmentId: string;
  programmeId: string;
  cohortId: string;
  /** Set when matching for one section; section-scoped rows only apply then. */
  sectionId?: string;
}

export function scopeApplies(row: ScopedRow, target: ScopeTarget): boolean {
  switch (row.scopeType) {
    case 'institute':
      return true;
    case 'department':
      return row.departmentId === target.departmentId;
    case 'programme':
      return row.programmeId === target.programmeId;
    case 'cohort':
      return row.cohortId === target.cohortId;
    case 'section':
      return target.sectionId != null && row.sectionId === target.sectionId;
  }
}
