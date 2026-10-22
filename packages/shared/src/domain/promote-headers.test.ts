import { describe, expect, it } from 'vitest';
import { headerScore, matchHeaders, normaliseHeader } from './headers';
import { promotePreview, type PromoteSourceCohort } from './promote';

const cohort = (over: Partial<PromoteSourceCohort>): PromoteSourceCohort => ({
  cohortId: 'c',
  batchId: 'b',
  displayCode: 'CSE S3',
  semester: 3,
  joinsBatchId: null,
  entryType: 'regular',
  totalSemesters: 8,
  programmeCode: 'BTECH',
  programmeLevel: 'ug',
  branchCode: 'CSE',
  isDefaultBranch: false,
  sections: [
    {
      name: 'A',
      displayName: 'CSE A',
      strength: 60,
      homeRoomId: 'g11',
      subGroups: [
        { name: 'A1', strength: 30 },
        { name: 'A2', strength: 30 },
      ],
    },
  ],
  ...over,
});

describe('promotePreview', () => {
  it('moves every cohort up one semester and copies sections and sub-groups', () => {
    const rows = promotePreview(
      [
        cohort({ cohortId: 'c1', batchId: 'b1', semester: 1, displayCode: 'CSE S1' }),
        cohort({ cohortId: 'c3', batchId: 'b3' }),
        cohort({ cohortId: 'c7', batchId: 'b7', semester: 7, displayCode: 'CSE S7' }),
      ],
      new Set(),
    );
    expect(rows.map((r) => [r.fromSemester, r.toSemester, r.action, r.toDisplayCode])).toEqual([
      [1, 2, 'promote', 'CSE S2'],
      [3, 4, 'promote', 'CSE S4'],
      [7, 8, 'promote', 'CSE S8'],
    ]);
    expect(rows[1]!.sections[0]!.subGroups).toHaveLength(2);
  });

  it('graduates a batch in its final semester', () => {
    const [row] = promotePreview([cohort({ semester: 8, displayCode: 'CSE S8' })], new Set());
    expect(row).toMatchObject({ toSemester: null, action: 'graduate', sections: [] });
  });

  it('works for a 10-semester programme', () => {
    const rows = promotePreview(
      [
        cohort({ semester: 9, totalSemesters: 10, displayCode: 'x' }),
        cohort({ semester: 10, totalSemesters: 10 }),
      ],
      new Set(),
    );
    expect(rows.map((r) => r.action)).toEqual(['promote', 'graduate']);
  });

  it('is safe to re-run: batches already promoted are left alone', () => {
    const [row] = promotePreview([cohort({ batchId: 'b1' })], new Set(['b1']));
    expect(row!.action).toBe('already_exists');
  });

  it('keeps custom codes and flags them when the year changes', () => {
    const [toEven, toNextYear] = promotePreview(
      [
        cohort({ semester: 3, displayCode: 'D2 CSE' }),
        cohort({ semester: 4, displayCode: 'D2 CSE' }),
      ],
      new Set(),
    );
    expect(toEven).toMatchObject({ toDisplayCode: 'D2 CSE', displayCodeNeedsReview: false });
    expect(toNextYear).toMatchObject({ toDisplayCode: 'D2 CSE', displayCodeNeedsReview: true });
  });

  it('a lateral cohort sitting in another batch’s sections copies no sections', () => {
    const [row] = promotePreview(
      [cohort({ joinsBatchId: 'regular', entryType: 'lateral', displayCode: 'CSE S3 LEET' })],
      new Set(),
    );
    expect(row).toMatchObject({
      toDisplayCode: 'CSE S4 LEET',
      joinsBatchId: 'regular',
      sections: [],
    });
  });
});

describe('matchHeaders', () => {
  const columns = [
    {
      key: 'employeeCode',
      label: 'Employee code',
      synonyms: ['Emp code', 'Emp no', 'Faculty code'],
      required: true,
    },
    { key: 'name', label: 'Name', synonyms: ['Faculty name', 'Teacher'], required: true },
    { key: 'shortCode', label: 'Short code', synonyms: ['Initials', 'Abbreviation'] },
    { key: 'designation', label: 'Designation' },
    { key: 'department', label: 'Department', synonyms: ['Dept'], required: true },
  ];

  it('normalises punctuation and case', () => {
    expect(normaliseHeader(' Emp. Code ')).toBe('empcode');
    expect(headerScore('EMP. CODE', 'Emp code')).toBe(1);
  });

  it('maps headers colleges actually use', () => {
    const result = matchHeaders(
      ['S.No', 'Emp. No.', 'Name of Faculty', 'Desig', 'Dept.', 'Initials', 'Mobile'],
      columns,
    );
    expect(result.mapping).toEqual({
      employeeCode: 1,
      name: 2,
      designation: 3,
      department: 4,
      shortCode: 5,
    });
    expect(result.unmatchedHeaders.map((h) => h.header)).toEqual(['S.No', 'Mobile']);
    expect(result.missingRequired).toEqual([]);
  });

  it('tolerates small typos', () => {
    expect(matchHeaders(['Deparment'], columns).mapping).toEqual({ department: 0 });
  });

  it('uses each header once and reports missing required columns', () => {
    const result = matchHeaders(['Name'], columns);
    expect(result.mapping).toEqual({ name: 0 });
    expect(result.missingRequired).toEqual(['employeeCode', 'department']);
  });
});
