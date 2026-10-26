import { describe, expect, it } from 'vitest';
import { demoTermSnapshot, demoTermSolution } from '../fixtures';
import { EXPORT_LABELS_EN, exportTable, tableToCsv } from './export';
import type { StoredSlot } from './read';
import { slotsFromPlacements } from './slots';
import { viewChoices, weekOf } from './view';

const snapshot = demoTermSnapshot();
const slots: StoredSlot[] = slotsFromPlacements(snapshot, demoTermSolution().placed).map(
  (s, i) => ({
    ...s,
    id: `00000000-0000-4000-8000-${String(1000 + i).padStart(12, '0')}`,
    versionId: '00000000-0000-4000-8000-000000000001',
  }),
);

/** CSV rows split into fields (no quoted newlines in these fixtures). */
function parse(csv: string): string[][] {
  return csv
    .trimEnd()
    .split(/\r\n/)
    .map((line) => {
      const fields: string[] = [];
      let field = '';
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]!;
        if (quoted && ch === '"' && line[i + 1] === '"') {
          field += '"';
          i++;
        } else if (ch === '"') {
          quoted = !quoted;
        } else if (ch === ',' && !quoted) {
          fields.push(field);
          field = '';
        } else {
          field += ch;
        }
      }
      return [...fields, field];
    });
}

describe('exportTable / tableToCsv', () => {
  const section = viewChoices(snapshot).section[0]!;
  const who = { kind: 'section' as const, id: section.id, name: section.name };
  const table = exportTable(weekOf(snapshot, slots, who), who, EXPORT_LABELS_EN);

  it('has a row per working day and a column per period and break', () => {
    expect(table.title).toBe(section.name);
    expect(table.header[0]).toBe('Day');
    expect(table.header[1]).toMatch(/^P1 \d\d:\d\d–\d\d:\d\d$/);
    expect(table.rows.map((r) => r.day)[0]).toBe('Monday');
    for (const row of table.rows) {
      expect(1 + row.cells.reduce((n, c) => n + c.span, 0)).toBe(table.header.length);
    }
  });

  it('writes the course, then teacher and room, and spans lab blocks', () => {
    const cells = table.rows.flatMap((r) => r.cells);
    const lab = cells.find((c) => c.span > 1)!;
    expect(lab.classes[0]![0]).toMatch(/\(Lab\)$/);
    const lecture = cells.find((c) => c.kind === 'classes' && c.span === 1)!;
    // A section's own name is not repeated; teachers and room are.
    expect(lecture.classes[0]![1]).not.toContain(section.name);
    expect(lecture.classes[0]![1].split(' · ').length).toBeGreaterThanOrEqual(2);
  });

  it('makes CSV with one field per column, empty where a lab block continues', () => {
    const rows = parse(tableToCsv(table));
    expect(rows).toHaveLength(1 + table.rows.length);
    for (const row of rows) expect(row).toHaveLength(table.header.length);
    expect(rows[0]![0]).toBe('Day');
    expect(rows.slice(1).some((r) => r.includes(''))).toBe(true);
  });

  it('quotes fields with commas and quotes', () => {
    const csv = tableToCsv({
      title: 'x',
      header: ['Day', 'P1'],
      rows: [
        {
          day: 'Monday',
          cells: [{ kind: 'classes', label: '', span: 1, classes: [['CS1 "A"', 'AB, CD']] }],
        },
      ],
    });
    expect(csv).toBe('Day,P1\r\nMonday,"CS1 ""A"" · AB, CD"\r\n');
  });
});
