/**
 * Date sheets: an exam's sessions (date + Morning/Evening) and the papers written in each.
 * Input schemas for the API and the check that no section writes two papers at once.
 */
import { z } from 'zod';
import { Count, Id, IsoDate, Minute } from '../contracts/common.v1';

const Settings = {
  /** Seats per hall kept empty for late changes. */
  reserveSeatsPerHall: Count.max(500),
  /** One more invigilator per this many students in a hall. */
  studentsPerInvigilator: z.int().min(1).max(500),
  /** At least this many invigilators per hall. */
  minInvigilatorsPerHall: z.int().min(1).max(20),
};

export const CreateExamInput = z.object({
  termId: Id,
  name: z.string().trim().min(1, 'Give the exam a name.').max(120),
  reserveSeatsPerHall: Settings.reserveSeatsPerHall.default(0),
  studentsPerInvigilator: Settings.studentsPerInvigilator.default(30),
  minInvigilatorsPerHall: Settings.minInvigilatorsPerHall.default(1),
});
export type CreateExamInput = z.infer<typeof CreateExamInput>;

export const UpdateExamInput = z
  .object({
    name: z.string().trim().min(1, 'Give the exam a name.').max(120),
    reserveSeatsPerHall: Settings.reserveSeatsPerHall,
    studentsPerInvigilator: Settings.studentsPerInvigilator,
    minInvigilatorsPerHall: Settings.minInvigilatorsPerHall,
  })
  .partial();
export type UpdateExamInput = z.infer<typeof UpdateExamInput>;

export const ExamSessionInput = z
  .object({
    date: IsoDate,
    /** e.g. "Morning" */
    label: z.string().trim().min(1, 'Name the session, e.g. Morning.').max(40),
    startMinute: Minute,
    endMinute: Minute,
  })
  .refine((s) => s.endMinute > s.startMinute, {
    message: 'The session must end after it starts.',
    path: ['endMinute'],
  });
export type ExamSessionInput = z.infer<typeof ExamSessionInput>;

export const ExamPaperInput = z.object({
  sessionId: Id,
  courseId: Id,
  sectionIds: z.array(Id).min(1, 'Pick at least one section.'),
});
export type ExamPaperInput = z.infer<typeof ExamPaperInput>;

export const UpdateExamPaperInput = ExamPaperInput.omit({ courseId: true }).partial();
export type UpdateExamPaperInput = z.infer<typeof UpdateExamPaperInput>;

export const ExamListQuery = z.object({ termId: Id.optional() });
export type ExamListQuery = z.infer<typeof ExamListQuery>;

export type ExamStatus = 'draft' | 'published' | 'archived';

export interface ExamSummaryDto {
  id: string;
  termId: string;
  name: string;
  status: ExamStatus;
  reserveSeatsPerHall: number;
  studentsPerInvigilator: number;
  minInvigilatorsPerHall: number;
  sessionCount: number;
  paperCount: number;
  /** First and last exam date, or null without sessions. */
  firstDate: string | null;
  lastDate: string | null;
}

export interface DateSheetPaperDto {
  id: string;
  courseId: string;
  code: string;
  title: string;
  sectionIds: string[];
  /** e.g. ["CS A", "CS B"], in sectionIds order; "(removed section)" if it is gone. */
  sectionNames: string[];
  /** Active students of those sections. */
  studentCount: number;
}

export interface DateSheetSessionDto {
  id: string;
  date: string;
  label: string;
  startMinute: number;
  endMinute: number;
  papers: DateSheetPaperDto[];
}

export interface DateSheetProblem {
  kind: 'section_clash';
  sessionId: string;
  sectionId: string;
  paperIds: string[];
  /** Plain language, e.g. "CS A has CS301 and MA301 in the same session (Mon 1 Dec, Morning)." */
  message: string;
}

export interface DateSheetDto {
  exam: ExamSummaryDto;
  sessions: DateSheetSessionDto[];
  problems: DateSheetProblem[];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mon 1 Dec" for 2026-12-01 (no time zone involved). */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${d} ${MONTHS[m - 1]}`;
}

/** Sections that write two papers in one session. */
export function dateSheetProblems(sessions: readonly DateSheetSessionDto[]): DateSheetProblem[] {
  const problems: DateSheetProblem[] = [];
  for (const session of sessions) {
    const bySection = new Map<string, { name: string; papers: DateSheetPaperDto[] }>();
    for (const paper of session.papers) {
      paper.sectionIds.forEach((sectionId, i) => {
        const entry = bySection.get(sectionId) ?? {
          name: paper.sectionNames[i] ?? 'A section',
          papers: [],
        };
        entry.papers.push(paper);
        bySection.set(sectionId, entry);
      });
    }
    for (const [sectionId, { name, papers }] of bySection) {
      if (papers.length < 2) continue;
      const codes = papers.map((p) => p.code);
      const list = `${codes.slice(0, -1).join(', ')} and ${codes.at(-1)}`;
      problems.push({
        kind: 'section_clash',
        sessionId: session.id,
        sectionId,
        paperIds: papers.map((p) => p.id),
        message: `${name} has ${list} in the same session (${shortDate(session.date)}, ${session.label}).`,
      });
    }
  }
  return problems;
}
