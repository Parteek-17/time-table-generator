import type { ExamDocTable } from '@slotwise/shared/exams';
import ExcelJS from 'exceljs';

/** Excel sheet names: at most 31 characters, none of []:*?/\, unique in the workbook. */
function sheetName(title: string, used: Set<string>): string {
  const base = title.replace(/[[\]:*?/\\]/g, '-').slice(0, 31) || 'Sheet';
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

const thin = { style: 'thin' } as const;

/** One sheet per table: title, subtitle, header, rows; set up to print on A4. */
export async function tablesToXlsx(tables: ExamDocTable[], landscape: boolean): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = 'Slotwise';
  const used = new Set<string>();
  for (const t of tables) {
    const sheet = book.addWorksheet(sheetName(t.title.replace(' — ', ' '), used), {
      pageSetup: {
        paperSize: 9, // A4
        orientation: landscape ? 'landscape' : 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        printTitlesRow: '3:3',
      },
      views: [{ state: 'frozen', ySplit: 3 }],
    });
    const width = Math.max(1, t.header.length);
    sheet.columns = t.header.map((h, i) => ({
      width: t.grid ? (i === 0 ? 8 : 12) : Math.max(8, Math.min(40, h.length + 6)),
    }));
    sheet.addRow([t.title]).font = { bold: true, size: 14 };
    sheet.addRow([t.subtitle]).font = { italic: true, color: { argb: 'FF555555' } };
    sheet.mergeCells(1, 1, 1, width);
    sheet.mergeCells(2, 1, 2, width);
    const header = sheet.addRow(t.header);
    header.font = { bold: true };
    header.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
      c.border = { top: thin, left: thin, bottom: thin, right: thin };
    });
    for (const row of t.rows) {
      const added = sheet.addRow(row);
      added.eachCell({ includeEmpty: true }, (c) => {
        c.alignment = { wrapText: true, vertical: 'top', horizontal: t.grid ? 'center' : 'left' };
        c.border = { top: thin, left: thin, bottom: thin, right: thin };
      });
    }
    if (t.footer) {
      sheet.addRow([]);
      sheet.addRow([t.footer]);
    }
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}
