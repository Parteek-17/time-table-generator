import { describe, expect, it } from 'vitest';
import {
  defaultCohortCode,
  defaultTermLabel,
  nextTerm,
  runningSemesters,
  semesterFor,
  sessionName,
  yearOfStudy,
  type TermRef,
} from './semester';

const btech = { totalSemesters: 8, lateralEntrySemester: 3 };
const mba = { totalSemesters: 4, lateralEntrySemester: null };
const barch = { totalSemesters: 10, lateralEntrySemester: null };

const odd = (y: number): TermRef => ({ sessionStartYear: y, kind: 'odd' });
const even = (y: number): TermRef => ({ sessionStartYear: y, kind: 'even' });
const regular = (y: number) => ({ admissionYear: y, entryType: 'regular' as const });
const lateral = (y: number) => ({ admissionYear: y, entryType: 'lateral' as const });

describe('semesterFor: regular entry', () => {
  it('first year: 1 in the odd term, 2 in the even term', () => {
    expect(semesterFor(regular(2026), btech, odd(2026))).toBe(1);
    expect(semesterFor(regular(2026), btech, even(2026))).toBe(2);
  });

  it('2 × (session start − admission year) + 1 or 2', () => {
    expect(semesterFor(regular(2025), btech, odd(2026))).toBe(3);
    expect(semesterFor(regular(2024), btech, odd(2026))).toBe(5);
    expect(semesterFor(regular(2023), btech, odd(2026))).toBe(7);
    expect(semesterFor(regular(2023), btech, even(2026))).toBe(8);
  });

  it('a batch past its final semester has no semester', () => {
    expect(semesterFor(regular(2022), btech, odd(2026))).toBeNull(); // would be 9
    expect(semesterFor(regular(2024), mba, odd(2026))).toBeNull(); // would be 5 of 4
  });

  it('a batch admitted after the session has not started', () => {
    expect(semesterFor(regular(2027), btech, odd(2026))).toBeNull();
    expect(semesterFor(regular(2027), btech, even(2026))).toBeNull();
  });

  it('a 10-semester programme (B.Arch) runs to semester 10', () => {
    expect(semesterFor(regular(2022), barch, odd(2026))).toBe(9);
    expect(semesterFor(regular(2022), barch, even(2026))).toBe(10);
    expect(semesterFor(regular(2021), barch, odd(2026))).toBeNull(); // would be 11
  });
});

describe('semesterFor: lateral entry', () => {
  it('B.Tech LEET joins in semester 3 the year they are admitted', () => {
    expect(semesterFor(lateral(2026), btech, odd(2026))).toBe(3);
    expect(semesterFor(lateral(2026), btech, even(2026))).toBe(4);
  });

  it('then moves up with the regular batch admitted a year earlier', () => {
    expect(semesterFor(lateral(2025), btech, odd(2026))).toBe(5);
    expect(semesterFor(lateral(2025), btech, odd(2026))).toBe(
      semesterFor(regular(2024), btech, odd(2026)),
    );
    expect(semesterFor(lateral(2024), btech, even(2026))).toBe(8);
  });

  it('past the final semester', () => {
    expect(semesterFor(lateral(2023), btech, odd(2026))).toBeNull(); // would be 9
  });

  it('a programme without lateral entry has no lateral batches', () => {
    expect(semesterFor(lateral(2026), mba, odd(2026))).toBeNull();
  });

  it('an even lateral-entry semester starts in the even term', () => {
    const p = { totalSemesters: 8, lateralEntrySemester: 4 };
    expect(semesterFor(lateral(2026), p, odd(2026))).toBeNull();
    expect(semesterFor(lateral(2026), p, even(2026))).toBe(4);
    expect(semesterFor(lateral(2026), p, odd(2027))).toBe(5);
  });
});

describe('term helpers', () => {
  it('runningSemesters by term kind', () => {
    expect(runningSemesters(btech, 'odd')).toEqual([1, 3, 5, 7]);
    expect(runningSemesters(btech, 'even')).toEqual([2, 4, 6, 8]);
    expect(runningSemesters(barch, 'even')).toEqual([2, 4, 6, 8, 10]);
  });

  it('nextTerm crosses into the next session after the even term', () => {
    expect(nextTerm(odd(2026))).toEqual(even(2026));
    expect(nextTerm(even(2026))).toEqual(odd(2027));
  });

  it('names', () => {
    expect(sessionName(2026)).toBe('2026-27');
    expect(sessionName(2099)).toBe('2099-00');
    expect(defaultTermLabel(odd(2026))).toBe('July–Dec 2026');
    expect(defaultTermLabel(even(2026))).toBe('Jan–June 2027');
    expect(yearOfStudy(3)).toBe(2);
    expect(yearOfStudy(4)).toBe(2);
  });

  it('defaultCohortCode', () => {
    const args = {
      programmeCode: 'BTECH',
      programmeLevel: 'ug' as const,
      branchCode: 'CSE',
      isDefaultBranch: false,
      entryType: 'regular' as const,
    };
    expect(defaultCohortCode({ ...args, semester: 3 })).toBe('CSE S3');
    expect(defaultCohortCode({ ...args, semester: 3, entryType: 'lateral' })).toBe('CSE S3 LEET');
    expect(
      defaultCohortCode({
        ...args,
        programmeCode: 'MBA',
        branchCode: 'GEN',
        isDefaultBranch: true,
        semester: 1,
      }),
    ).toBe('MBA S1');
    expect(
      defaultCohortCode({ ...args, programmeCode: 'MTECH', programmeLevel: 'pg', semester: 1 }),
    ).toBe('MTECH CSE S1');
  });
});
