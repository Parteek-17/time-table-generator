/**
 * Reading uploaded sheets and writing templates (ADR 0011). Every cell becomes text: dates
 * as yyyy-mm-dd, numbers as typed, formulas as their result. The row number is the one Excel
 * shows, so "Row 14" in the preview is row 14 in the file.
 */
import { matchHeaders, type ImportTemplate } from '@slotwise/shared';
import ExcelJS from 'exceljs';

export interface SheetRow {
  rowNumber: number;
  cells: string[];
}

export interface ReadSheet {
  headerRowNumber: number;
  headers: string[];
  rows: SheetRow[];
}

export class SheetError extends Error {}

export const HOW_TO_FILL = 'How to fill';

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
    if ('text' in value) return String(value.text);
    if ('error' in value) return '';
    return '';
  }
  return String(value);
}

async function readXlsx(buffer: Buffer): Promise<SheetRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    // ExcelJS's types want its own Buffer type; a Node Buffer is what it reads.
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new SheetError('We could not open this file. Save it as .xlsx or .csv and try again.');
  }
  const sheet = workbook.worksheets.find((s) => s.name !== HOW_TO_FILL && s.actualRowCount > 0);
  if (!sheet) throw new SheetError('The file has no rows.');
  const rows: SheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = cellText(cell.value).trim();
    });
    rows.push({ rowNumber, cells: Array.from(cells, (c) => c ?? '') });
  });
  return rows;
}

/** RFC 4180 CSV: quotes, doubled quotes, CRLF; a UTF-8 BOM is dropped. Tabs work too. */
export function parseCsv(text: string): SheetRow[] {
  const src = text.startsWith('\u{FEFF}') ? text.slice(1) : text;
  const firstLine = src.slice(0, src.indexOf('\n') >>> 0);
  const sep = firstLine.split('\t').length > firstLine.split(',').length ? '\t' : ',';
  const rows: SheetRow[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let rowStart = 1;
  const endRow = () => {
    cells.push(cell);
    if (cells.some((c) => c.trim() !== '')) {
      rows.push({ rowNumber: rowStart, cells: cells.map((c) => c.trim()) });
    }
    cells = [];
    cell = '';
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === sep) {
      cells.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      endRow();
      line++;
      rowStart = line;
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || cells.length > 0) endRow();
  return rows;
}

function isXlsx(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b; // "PK" (zip)
}

function isOldExcel(buffer: Buffer): boolean {
  return buffer.length > 8 && buffer.readUInt32BE(0) === 0xd0cf11e0; // OLE2 (.xls)
}

/**
 * Reads the first data sheet and picks the header row: of the first 10 rows, the one that
 * matches the most template columns (sheets often have a title row above the headers).
 */
export async function readSheet(
  buffer: Buffer,
  fileName: string,
  template: ImportTemplate,
): Promise<ReadSheet> {
  if (isOldExcel(buffer)) {
    throw new SheetError(
      'This is an old Excel (.xls) file. Open it in Excel, save it as .xlsx and upload that.',
    );
  }
  let rows: SheetRow[];
  if (isXlsx(buffer)) rows = await readXlsx(buffer);
  else if (/\.(csv|txt|tsv)$/i.test(fileName)) rows = parseCsv(buffer.toString('utf8'));
  else throw new SheetError('Upload an Excel (.xlsx) or CSV file.');
  if (rows.length === 0) throw new SheetError('The file has no rows.');

  let best = 0;
  let bestScore = -1;
  rows.slice(0, 10).forEach((row, i) => {
    const score = Object.keys(matchHeaders(row.cells, template.columns).mapping).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  const header = rows[best]!;
  return {
    headerRowNumber: header.rowNumber,
    headers: header.cells,
    rows: rows.slice(best + 1),
  };
}

/** The .xlsx template: an empty sheet with the headers (and drop-downs), and "How to fill". */
export async function buildTemplate(template: ImportTemplate): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Slotwise';
  const sheet = workbook.addWorksheet(template.title.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = template.columns.map((c) => ({
    header: c.label,
    key: c.key,
    width: Math.max(12, c.label.length + 4, c.example.length + 2),
  }));
  const header = sheet.getRow(1);
  header.font = { bold: true };
  template.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.note = `${c.required ? 'Required. ' : ''}${c.help}`;
    if (c.required) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    }
    if (c.values) {
      const letter = sheet.getColumn(i + 1).letter;
      for (let r = 2; r <= 1001; r++) {
        sheet.getCell(`${letter}${r}`).dataValidation = {
          type: 'list',
          allowBlank: !c.required,
          formulae: [`"${c.values.join(',')}"`],
        };
      }
    }
  });

  const help = workbook.addWorksheet(HOW_TO_FILL);
  help.columns = [
    { header: 'Column', key: 'label', width: 24 },
    { header: 'Required', key: 'required', width: 10 },
    { header: 'What to type', key: 'help', width: 70 },
    { header: 'Example', key: 'example', width: 24 },
  ];
  help.getRow(1).font = { bold: true };
  help.insertRow(1, [`${template.title}: one row is ${template.rowIs}`]);
  help.getRow(1).font = { bold: true, size: 13 };
  help.insertRow(2, [
    'Fill the first sheet, one row per line, and upload it on the Import page. Keep the header row. ' +
      `Importing again updates rows with the same ${template.key
        .map((k) => template.columns.find((c) => c.key === k)!.label)
        .join(' + ')}.`,
  ]);
  help.getRow(2).alignment = { wrapText: true };
  help.mergeCells('A1:D1');
  help.mergeCells('A2:D2');
  help.getRow(2).height = 32;
  for (const c of template.columns) {
    help.addRow({
      label: c.label,
      required: c.required ? 'Yes' : '',
      help: c.help,
      example: c.example,
    });
  }
  help.getColumn('help').alignment = { wrapText: true, vertical: 'top' };

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
