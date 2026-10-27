import { describe, expect, it } from 'vitest';
import {
  dateSheetProblems,
  ExamSessionInput,
  shortDate,
  type DateSheetPaperDto,
  type DateSheetSessionDto,
} from './date-sheet';

const paper = (id: string, code: string, sections: [string, string][]): DateSheetPaperDto => ({
  id,
  courseId: `course-${id}`,
  code,
  title: code,
  sectionIds: sections.map(([sid]) => sid),
  sectionNames: sections.map(([, name]) => name),
  studentCount: 60 * sections.length,
});

const session = (id: string, papers: DateSheetPaperDto[]): DateSheetSessionDto => ({
  id,
  date: '2026-12-01',
  label: 'Morning',
  startMinute: 600,
  endMinute: 780,
  papers,
});

describe('date sheet', () => {
  it('formats dates without a time zone', () => {
    expect(shortDate('2026-12-01')).toBe('Tue 1 Dec');
    expect(shortDate('2027-01-04')).toBe('Mon 4 Jan');
  });

  it('accepts a session and refuses one that ends before it starts', () => {
    const ok = { date: '2026-12-01', label: 'Morning', startMinute: 600, endMinute: 780 };
    expect(ExamSessionInput.safeParse(ok).success).toBe(true);
    const bad = ExamSessionInput.safeParse({ ...ok, endMinute: 540 });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toBe('The session must end after it starts.');
  });

  it('flags a section that writes two papers in one session, in plain words', () => {
    const problems = dateSheetProblems([
      session('s1', [
        paper('p1', 'CS301', [
          ['a', 'CS A'],
          ['b', 'CS B'],
        ]),
        paper('p2', 'MA301', [['a', 'CS A']]),
        paper('p3', 'EC301', [['c', 'EC A']]),
      ]),
    ]);
    expect(problems).toEqual([
      {
        kind: 'section_clash',
        sessionId: 's1',
        sectionId: 'a',
        paperIds: ['p1', 'p2'],
        message: 'CS A has CS301 and MA301 in the same session (Tue 1 Dec, Morning).',
      },
    ]);
  });

  it('allows the same section in different sessions', () => {
    expect(
      dateSheetProblems([
        session('s1', [paper('p1', 'CS301', [['a', 'CS A']])]),
        session('s2', [paper('p2', 'MA301', [['a', 'CS A']])]),
      ]),
    ).toEqual([]);
  });
});
