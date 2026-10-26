import type { ExportTable } from '@slotwise/shared/timetable';
import ExcelJS from 'exceljs';

/** Excel sheet names: at most 31 characters, none of []:*?/\, unique in the workbook. */
function sheetName(title: string, used: Set<string>): string {
  const base = title.replace(/[[\]:*?/\\]/g, '-').slice(0, 31) || 'Timetable';
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

/**
 * A workbook with one sheet per week: a title row, the period headings, then a row per day.
 * Lab blocks are merged across their periods; set up to print on one landscape A4 page.
 */
export async function tablesToXlsx(tables: ExportTable[], subtitle: string): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = 'Slotwise';
  const used = new Set<string>();
  for (const table of tables) {
    const sheet = book.addWorksheet(sheetName(table.title, used), {
      pageSetup: {
        paperSize: 9, // A4
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
      },
      views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }],
    });
    const width = table.header.length;
    sheet.columns = table.header.map((_, i) => ({ width: i === 0 ? 12 : 18 }));

    sheet.addRow([table.title]).font = { bold: true, size: 14 };
    sheet.addRow([subtitle]).font = { italic: true, color: { argb: 'FF555555' } };
    sheet.mergeCells(1, 1, 1, width);
    sheet.mergeCells(2, 1, 2, width);
    const header = sheet.addRow(table.header);
    header.font = { bold: true };
    header.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
    });

    for (const row of table.rows) {
      const values: string[] = [row.day];
      const merges: [number, number][] = [];
      for (const cell of row.cells) {
        const start = values.length + 1;
        values.push(
          cell.kind === 'break'
            ? cell.label
            : cell.classes.map(([course, details]) => `${course}\n${details}`).join('\n\n'),
        );
        for (let i = 1; i < cell.span; i++) values.push('');
        if (cell.span > 1) merges.push([start, start + cell.span - 1]);
      }
      const added = sheet.addRow(values);
      added.getCell(1).font = { bold: true };
      for (const [from, to] of merges) sheet.mergeCells(added.number, from, added.number, to);
      added.eachCell({ includeEmpty: true }, (c) => {
        c.alignment = { wrapText: true, vertical: 'top' };
        c.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    }
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}
