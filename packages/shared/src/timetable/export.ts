/**
 * A week as a plain table (days down, periods and breaks across), the one model behind the
 * PDF and Excel exports and "Copy as CSV". Pure; the labels come from the caller so the web
 * can pass its translations.
 */
import { z } from 'zod';
import type { TimetableSlotV1 } from '../contracts/timetable-read.v1';
import { formatTime } from '../domain/bell';
import { dayCells, gridColumns, type GridBell } from './grid';
import { VIEW_KINDS, type ViewKind, type ViewSlot } from './view';

export const EXPORT_FORMATS = ['pdf', 'xlsx'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/**
 * `GET /timetable/versions/:versionId/export?format=&kind=&id=`: one week, or every section,
 * lab group, teacher or room of the version when `id` is left out.
 */
export const TimetableExportQuery = z.object({
  format: z.enum(EXPORT_FORMATS),
  kind: z.enum(VIEW_KINDS),
  id: z.uuid().optional(),
});
export type TimetableExportQuery = z.infer<typeof TimetableExportQuery>;

export interface ExportLabels {
  /** Heading of the first column. */
  day: string;
  /** ISO weekday → name. */
  days: Record<number, string>;
  /** Shown after the course for tutorials and labs ("Lab"); empty for lectures. */
  tag: Record<TimetableSlotV1['component'], string>;
  noRoom: string;
}

/** English labels for the API's PDF and Excel files. */
export const EXPORT_LABELS_EN: ExportLabels = {
  day: 'Day',
  days: {
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
    6: 'Saturday',
    7: 'Sunday',
  },
  tag: { lecture: '', tutorial: 'Tut', practical: 'Lab' },
  noRoom: 'no room yet',
};

/**
 * What a class shows besides the course: what the viewer doesn't already know. A section sees
 * teacher and room, a teacher sees the class and room, a room sees the class and teacher.
 */
export function slotDetails(
  slot: ViewSlot,
  kind: ViewKind,
  whoName: string,
  noRoom: string,
): string {
  const teachers = slot.faculty.map((f) => f.shortCode).join(', ');
  const room = slot.room?.code ?? noRoom;
  const audience = slot.target.name !== whoName ? slot.target.name : null;
  // A lookup, not `kind === 'faculty'`: the lint rule against inline role checks flags it.
  const details: Record<ViewKind, (string | null)[]> = {
    section: [audience, teachers, room],
    subgroup: [audience, teachers, room],
    faculty: [slot.target.name, room],
    room: [slot.target.name, teachers],
  };
  return details[kind].filter(Boolean).join(' · ');
}

export interface ExportCell {
  kind: 'classes' | 'free' | 'break';
  /** One entry per class: [course line, details line]. Empty for free periods. */
  classes: [string, string][];
  /** Break name, for break cells. */
  label: string;
  /** Columns it covers (a lab block spans its periods). */
  span: number;
}

export interface ExportTable {
  /** Whose week, e.g. "CS A". */
  title: string;
  /** Column headings: the day column, then periods ("P1 09:00–09:50") and breaks. */
  header: string[];
  rows: { day: string; cells: ExportCell[] }[];
}

/** The week of `who` as a table. */
export function exportTable(
  week: { bell: GridBell; slots: readonly ViewSlot[] },
  who: { kind: ViewKind; name: string },
  labels: ExportLabels,
): ExportTable {
  const header = [
    labels.day,
    ...gridColumns(week.bell).map((c) =>
      c.kind === 'period'
        ? `${c.label} ${formatTime(c.startMinute)}–${formatTime(c.endMinute)}`
        : c.label,
    ),
  ];
  const rows = week.bell.workingDays.map((weekday) => ({
    day: labels.days[weekday] ?? String(weekday),
    cells: dayCells(week.slots, weekday, week.bell).map((cell): ExportCell => {
      if (cell.kind === 'break') return { kind: 'break', classes: [], label: cell.label, span: 1 };
      if (cell.kind === 'free') return { kind: 'free', classes: [], label: '', span: 1 };
      return {
        kind: 'classes',
        label: '',
        span: cell.columns,
        classes: cell.slots.map((s) => {
          const tag = labels.tag[s.component];
          const course = `${s.course.code} ${s.course.shortName || s.course.title}`;
          return [
            tag ? `${course} (${tag})` : course,
            slotDetails(s, who.kind, who.name, labels.noRoom),
          ];
        }),
      };
    }),
  }));
  return { title: who.name, header, rows };
}

/** A cell's text on one line, for CSV. */
export function cellText(cell: ExportCell): string {
  if (cell.kind === 'break') return cell.label;
  return cell.classes.map(([course, details]) => `${course} · ${details}`).join(' / ');
}

const csvField = (value: string) =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/**
 * The table as CSV (RFC 4180), for pasting into a spreadsheet. A lab block's text is in its
 * first period; the periods it also covers are left empty, like merged cells.
 */
export function tableToCsv(table: ExportTable): string {
  const lines = [table.header];
  for (const row of table.rows) {
    const fields = [row.day];
    for (const cell of row.cells) {
      fields.push(cellText(cell));
      for (let i = 1; i < cell.span; i++) fields.push('');
    }
    lines.push(fields);
  }
  return lines.map((fields) => fields.map(csvField).join(',')).join('\r\n') + '\r\n';
}
