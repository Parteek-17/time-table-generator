/**
 * Printouts of a seating plan (CLAUDE.md "Exam seating rules", outputs): hall seating chart,
 * roll-number → hall notice list, attendance sheets, invigilator duty chart. Built as plain
 * tables here; the API turns them into PDF and Excel.
 */
import { z } from 'zod';
import { shortDate } from './date-sheet';

export const EXAM_DOCUMENTS = ['hall-chart', 'notice', 'attendance', 'duties'] as const;
export type ExamDocument = (typeof EXAM_DOCUMENTS)[number];

export const ExamExportQuery = z.object({
  doc: z.enum(EXAM_DOCUMENTS),
  format: z.enum(['pdf', 'xlsx']),
});
export type ExamExportQuery = z.infer<typeof ExamExportQuery>;

/** One printed page (or Excel sheet): a title, a line under it, and a table. */
export interface ExamDocTable {
  title: string;
  subtitle: string;
  header: string[];
  rows: string[][];
  /** Hall charts: show cells as seats (fixed width, two lines). */
  grid?: boolean;
  /** Attendance sheets: an empty signature column is the last one. */
  footer?: string;
}

export interface PlanOutputData {
  examName: string;
  date: string;
  sessionLabel: string;
  startMinute: number;
  endMinute: number;
  halls: { id: string; code: string; rows: number; columns: number }[];
  seats: {
    rollNo: string;
    name: string;
    sectionName: string;
    paperCode: string;
    hallId: string;
    hallCode: string;
    row: number;
    column: number;
    label: string;
  }[];
  duties: { facultyName: string; hallId: string; hallCode: string }[];
}

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Natural order: "CS9" before "CS10". */
export function compareRoll(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}

function when(d: PlanOutputData): string {
  return `${d.examName} · ${shortDate(d.date)} ${d.date.slice(0, 4)}, ${d.sessionLabel} (${hhmm(d.startMinute)}–${hhmm(d.endMinute)})`;
}

const usedHalls = (d: PlanOutputData) =>
  d.halls.filter((h) => d.seats.some((s) => s.hallId === h.id));

/** One page per hall: rows front to back, seats left to right, roll number and paper. */
export function hallCharts(d: PlanOutputData): ExamDocTable[] {
  return usedHalls(d).map((hall) => {
    const at = new Map(
      d.seats.filter((s) => s.hallId === hall.id).map((s) => [`${s.row}:${s.column}`, s]),
    );
    const rows = Array.from({ length: hall.rows }, (_, r) => [
      `Row ${r + 1}`,
      ...Array.from({ length: hall.columns }, (_, c) => {
        const s = at.get(`${r + 1}:${c + 1}`);
        return s ? `${s.rollNo}\n${s.paperCode}` : '';
      }),
    ]);
    const invigilators = d.duties.filter((x) => x.hallId === hall.id).map((x) => x.facultyName);
    return {
      title: `Hall ${hall.code} — seating chart`,
      subtitle: `${when(d)} · Front of the hall at the top · Invigilators: ${invigilators.join(', ') || '—'}`,
      header: ['', ...Array.from({ length: hall.columns }, (_, c) => `Seat ${c + 1}`)],
      rows,
      grid: true,
    };
  });
}

/**
 * The notice-board list: for each paper and section, which roll numbers sit in which hall.
 * Students look for their roll number, so rows go by paper, then first roll number.
 */
export function noticeList(d: PlanOutputData): ExamDocTable {
  const groups = new Map<
    string,
    { paper: string; section: string; hall: string; rolls: string[] }
  >();
  for (const s of d.seats) {
    const key = `${s.paperCode}|${s.sectionName}|${s.hallCode}`;
    const g = groups.get(key) ?? {
      paper: s.paperCode,
      section: s.sectionName,
      hall: s.hallCode,
      rolls: [],
    };
    g.rolls.push(s.rollNo);
    groups.set(key, g);
  }
  const rows = [...groups.values()]
    .map((g) => ({ ...g, rolls: g.rolls.sort(compareRoll) }))
    .sort((x, y) => x.paper.localeCompare(y.paper) || compareRoll(x.rolls[0]!, y.rolls[0]!))
    .map((g) => [
      g.paper,
      g.section,
      g.rolls.length === 1 ? g.rolls[0]! : `${g.rolls[0]} to ${g.rolls.at(-1)}`,
      String(g.rolls.length),
      g.hall,
    ]);
  return {
    title: 'Where to sit',
    subtitle: when(d),
    header: ['Paper', 'Section', 'Roll numbers', 'Students', 'Hall'],
    rows,
  };
}

/** One sheet per hall in roll-number order, with a column to sign. */
export function attendanceSheets(d: PlanOutputData): ExamDocTable[] {
  return usedHalls(d).map((hall) => {
    const seats = d.seats
      .filter((s) => s.hallId === hall.id)
      .sort((x, y) => compareRoll(x.rollNo, y.rollNo));
    return {
      title: `Hall ${hall.code} — attendance`,
      subtitle: when(d),
      header: ['#', 'Roll no.', 'Name', 'Paper', 'Seat', 'Answer book no.', 'Signature'],
      rows: seats.map((s, i) => [String(i + 1), s.rollNo, s.name, s.paperCode, s.label, '', '']),
      footer: `Present: ____   Absent: ____   Invigilator's signature: ______________`,
    };
  });
}

/** Who supervises which hall. */
export function dutyChart(d: PlanOutputData): ExamDocTable {
  const rows = usedHalls(d).map((hall) => {
    const seats = d.seats.filter((s) => s.hallId === hall.id);
    return [
      hall.code,
      d.duties
        .filter((x) => x.hallId === hall.id)
        .map((x) => x.facultyName)
        .join(', ') || '— none —',
      [...new Set(seats.map((s) => s.paperCode))].sort().join(', '),
      String(seats.length),
    ];
  });
  return {
    title: 'Invigilation duties',
    subtitle: when(d),
    header: ['Hall', 'Invigilators', 'Papers', 'Students'],
    rows,
  };
}

export function examDocument(doc: ExamDocument, d: PlanOutputData): ExamDocTable[] {
  switch (doc) {
    case 'hall-chart':
      return hallCharts(d);
    case 'notice':
      return [noticeList(d)];
    case 'attendance':
      return attendanceSheets(d);
    case 'duties':
      return [dutyChart(d)];
  }
}

export const EXAM_DOCUMENT_NAMES: Record<ExamDocument, string> = {
  'hall-chart': 'seating-charts',
  notice: 'where-to-sit',
  attendance: 'attendance-sheets',
  duties: 'invigilation-duties',
};
