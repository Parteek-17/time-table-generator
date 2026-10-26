import { describe, expect, it } from 'vitest';
import { matchHeaders } from './headers';
import {
  IMPORT_KINDS,
  IMPORT_TEMPLATES,
  mapRow,
  parseChoice,
  parseDate,
  parseDecimal,
  parseList,
  parseWhole,
  parseYesNo,
  rowKey,
} from './imports';

describe('import templates', () => {
  it('has a template for each of the 9 kinds, with unique column keys and keys that exist', () => {
    expect(IMPORT_KINDS).toHaveLength(9);
    for (const kind of IMPORT_KINDS) {
      const t = IMPORT_TEMPLATES[kind];
      expect(t.kind).toBe(kind);
      const keys = t.columns.map((c) => c.key);
      expect(new Set(keys).size, kind).toBe(keys.length);
      for (const k of t.key) expect(keys, `${kind} key ${k}`).toContain(k);
      expect(
        t.columns.some((c) => c.required),
        kind,
      ).toBe(true);
    }
  });

  it('matches its own labels exactly, so a filled-in template maps without help', () => {
    for (const kind of IMPORT_KINDS) {
      const t = IMPORT_TEMPLATES[kind];
      const match = matchHeaders(
        t.columns.map((c) => c.label),
        t.columns,
      );
      expect(match.missingRequired, kind).toEqual([]);
      expect(match.unmatchedHeaders, kind).toEqual([]);
      t.columns.forEach((c, i) => expect(match.mapping[c.key], `${kind}.${c.key}`).toBe(i));
    }
  });

  it('recognises the headers colleges already use', () => {
    const faculty = matchHeaders(
      ['S.No', 'Emp. Code', 'Name of Faculty', 'Initials', 'Designation', 'Dept', 'Email ID'],
      IMPORT_TEMPLATES.faculty.columns,
    );
    expect(faculty.mapping).toMatchObject({
      employeeCode: 1,
      name: 2,
      shortCode: 3,
      designation: 4,
      department: 5,
      email: 6,
    });
    expect(faculty.missingRequired).toEqual([]);
    expect(faculty.unmatchedHeaders.map((h) => h.header)).toEqual(['S.No']);

    const students = matchHeaders(
      ['Roll No', 'URN', 'Student Name', 'Program', 'Branch', 'Batch'],
      IMPORT_TEMPLATES.students.columns,
    );
    expect(students.mapping).toMatchObject({
      classRollNo: 0,
      universityRollNo: 1,
      name: 2,
      programme: 3,
      branch: 4,
      admissionYear: 5,
    });
  });
});

describe('cell values', () => {
  it('reads whole numbers and decimals, and flags text', () => {
    expect(parseWhole('')).toBeNull();
    expect(parseWhole(' 60 ')).toBe(60);
    expect(parseWhole('1,200')).toBe(1200);
    expect(parseWhole('3.0')).toBe(3);
    expect(parseWhole('3.5')).toBeUndefined();
    expect(parseWhole('sixty')).toBeUndefined();
    expect(parseDecimal('3.5')).toBe(3.5);
    expect(parseDecimal('x')).toBeUndefined();
  });

  it('reads yes/no in the usual spellings', () => {
    expect(parseYesNo('Yes')).toBe(true);
    expect(parseYesNo('y')).toBe(true);
    expect(parseYesNo('FALSE')).toBe(false);
    expect(parseYesNo('')).toBeNull();
    expect(parseYesNo('maybe')).toBeUndefined();
  });

  it('splits lists on commas, semicolons and slashes', () => {
    expect(parseList('CSE, IT; ME/ECE')).toEqual(['CSE', 'IT', 'ME', 'ECE']);
    expect(parseList('  ')).toEqual([]);
  });

  it('matches choices by value or name, ignoring case and punctuation', () => {
    const options = {
      assistant_professor: ['Assistant Professor', 'Asst Prof', 'AP'],
      professor: ['Professor', 'Prof'],
    } as const;
    expect(parseChoice('Asst. Prof.', options)).toBe('assistant_professor');
    expect(parseChoice('assistant_professor', options)).toBe('assistant_professor');
    expect(parseChoice('PROF', options)).toBe('professor');
    expect(parseChoice('Dean', options)).toBeUndefined();
    expect(parseChoice('', options)).toBeNull();
  });

  it('reads dates the way Indian sheets write them (day before month)', () => {
    expect(parseDate('2026-10-20')).toBe('2026-10-20');
    expect(parseDate('20-10-2026')).toBe('2026-10-20');
    expect(parseDate('20/10/2026')).toBe('2026-10-20');
    expect(parseDate('5.1.27')).toBe('2027-01-05');
    expect(parseDate('20 Oct 2026')).toBe('2026-10-20');
    expect(parseDate('20-October-2026')).toBe('2026-10-20');
    expect(parseDate('31-02-2026')).toBeUndefined();
    expect(parseDate('next Monday')).toBeUndefined();
    expect(parseDate('')).toBeNull();
  });
});

describe('rows', () => {
  it('maps file cells to template columns and builds a case-insensitive key', () => {
    const t = IMPORT_TEMPLATES.departments;
    const data = mapRow(t, { code: 1, name: 0 }, ['Computer Science ', ' cse']);
    expect(data).toEqual({ code: 'cse', name: 'Computer Science', kind: '' });
    expect(rowKey(t, data)).toBe(rowKey(t, { ...data, code: 'CSE' }));
  });
});
