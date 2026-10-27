/**
 * Builds the sample "full setup" Excel files in docs/samples/full-setup/:
 * - Slotwise-Full-Setup.xlsx: one linked workbook (Start here + one sheet per step, drop-downs
 *   that pick codes from earlier sheets) to read and edit;
 * - 01-departments.xlsx … 09-who-teaches-what.xlsx: the same rows in the exact import template,
 *   one file per upload (the importer reads the first sheet of a file).
 * The data is fictional: a Civil Engineering department added to the Demo Institute.
 *
 *   pnpm --filter @slotwise/api exec tsx scripts/sample-setup-workbook.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { IMPORT_TEMPLATES, type ImportKindName } from '@slotwise/shared';
import ExcelJS from 'exceljs';
import { buildTemplate } from '../src/imports/spreadsheet';

type Row = Record<string, string | number>;

const STEPS: { kind: ImportKindName; file: string; sheet: string; note: string; rows: Row[] }[] = [
  {
    kind: 'departments',
    file: '01-departments.xlsx',
    sheet: 'Departments',
    note: 'The new department.',
    rows: [{ code: 'CE', name: 'Civil Engineering', kind: 'Teaching' }],
  },
  {
    kind: 'programmes',
    file: '02-programmes.xlsx',
    sheet: 'Programmes',
    note: 'Adds the Civil branch to the existing B.Tech.',
    rows: [
      {
        code: 'BTECH',
        name: 'B.Tech',
        level: 'UG',
        totalSemesters: 8,
        lateralEntrySemester: 3,
        branchCode: 'CE',
        branchName: 'Civil Engineering',
        branchDepartment: 'CE',
      },
    ],
  },
  {
    kind: 'courses',
    file: '03-courses.xlsx',
    sheet: 'Courses',
    note: 'Semester 1 courses of Scheme 2024 for the Civil branch, with L-T-P.',
    rows: [
      {
        programme: 'BTECH',
        scheme: 'Scheme 2024',
        semester: 1,
        code: 'CE101',
        title: 'Engineering Mechanics',
        shortName: 'EM',
        lectures: 3,
        tutorials: 1,
        practicals: 0,
        syllabusHours: 45,
        type: 'Core',
        department: 'CE',
        branches: 'CE',
      },
      {
        programme: 'BTECH',
        scheme: 'Scheme 2024',
        semester: 1,
        code: 'CE102',
        title: 'Surveying I',
        shortName: 'SUR',
        lectures: 3,
        tutorials: 0,
        practicals: 2,
        syllabusHours: 45,
        type: 'Core',
        department: 'CE',
        labCategory: 'Survey lab',
        labBlockLength: 2,
        branches: 'CE',
      },
      {
        programme: 'BTECH',
        scheme: 'Scheme 2024',
        semester: 1,
        code: 'CE103',
        title: 'Building Materials',
        shortName: 'BM',
        lectures: 3,
        tutorials: 0,
        practicals: 0,
        syllabusHours: 42,
        type: 'Core',
        department: 'CE',
        branches: 'CE',
      },
      {
        programme: 'BTECH',
        scheme: 'Scheme 2024',
        semester: 1,
        code: 'CE104',
        title: 'Civil Engineering Workshop',
        shortName: 'CEW',
        lectures: 0,
        tutorials: 0,
        practicals: 2,
        syllabusHours: 28,
        type: 'Lab',
        department: 'CE',
        labCategory: 'Civil lab',
        labBlockLength: 2,
        branches: 'CE',
      },
    ],
  },
  {
    kind: 'rooms',
    file: '04-rooms.xlsx',
    sheet: 'Rooms',
    note: 'A new Civil Block: two classrooms, a tutorial room and a lab.',
    rows: [
      {
        code: 'CB-101',
        building: 'Civil Block',
        floor: 0,
        type: 'Lecture',
        rows: 10,
        seatsPerRow: 6,
        examSeatsPerBench: 1,
        ownerDepartment: 'CE',
        isShared: 'Yes',
        isAccessible: 'Yes',
      },
      {
        code: 'CB-102',
        building: 'Civil Block',
        floor: 1,
        type: 'Lecture',
        rows: 10,
        seatsPerRow: 6,
        examSeatsPerBench: 1,
        ownerDepartment: 'CE',
        isShared: 'Yes',
        isAccessible: 'No',
      },
      {
        code: 'CB-T1',
        building: 'Civil Block',
        floor: 1,
        type: 'Tutorial',
        rows: 5,
        seatsPerRow: 6,
        examSeatsPerBench: 1,
        ownerDepartment: 'CE',
        isShared: 'Yes',
        isAccessible: 'No',
      },
      {
        code: 'CB-LAB1',
        building: 'Civil Block',
        floor: 0,
        type: 'Lab',
        labCategories: 'Survey lab, Civil lab',
        rows: 6,
        seatsPerRow: 5,
        examSeatsPerBench: 1,
        ownerDepartment: 'CE',
        isShared: 'No',
        isAccessible: 'Yes',
      },
    ],
  },
  {
    kind: 'faculty',
    file: '05-faculty.xlsx',
    sheet: 'Faculty',
    note: 'Five fictional Civil Engineering teachers with load limits.',
    rows: [
      {
        employeeCode: 'E9001',
        name: 'Dr. Ravi Malhotra',
        shortCode: 'CRM',
        email: 'ravi.malhotra@example.edu',
        designation: 'Professor',
        experience: 'Experienced',
        department: 'CE',
        maxPeriodsPerDay: 4,
        maxPeriodsPerWeek: 14,
      },
      {
        employeeCode: 'E9002',
        name: 'Dr. Nisha Sood',
        shortCode: 'CNS',
        email: 'nisha.sood@example.edu',
        designation: 'Associate Professor',
        experience: 'Experienced',
        department: 'CE',
        maxPeriodsPerDay: 5,
        maxPeriodsPerWeek: 16,
      },
      {
        employeeCode: 'E9003',
        name: 'Mr. Arjun Verma',
        shortCode: 'CAV',
        email: 'arjun.verma@example.edu',
        designation: 'Assistant Professor',
        experience: 'Experienced',
        department: 'CE',
        maxPeriodsPerDay: 5,
        maxPeriodsPerWeek: 18,
      },
      {
        employeeCode: 'E9004',
        name: 'Ms. Priya Kohli',
        shortCode: 'CPK',
        email: 'priya.kohli@example.edu',
        designation: 'Assistant Professor',
        experience: 'Fresher',
        department: 'CE',
        maxPeriodsPerDay: 4,
        maxPeriodsPerWeek: 16,
      },
      {
        employeeCode: 'E9005',
        name: 'Mr. Sahil Gill',
        shortCode: 'CSG',
        email: 'sahil.gill@example.edu',
        designation: 'Lecturer',
        experience: 'Fresher',
        department: 'CE',
        maxPeriodsPerDay: 5,
        maxPeriodsPerWeek: 18,
      },
    ],
  },
  {
    kind: 'batches_sections',
    file: '06-batches-and-sections.xlsx',
    sheet: 'Batches and sections',
    note: 'The 2026 Civil batch: one section of 60 in two lab groups (A1, A2). Choose the current term when you upload.',
    rows: [
      {
        programme: 'BTECH',
        branch: 'CE',
        admissionYear: 2026,
        entry: 'Regular',
        scheme: 'Scheme 2024',
        section: 'A',
        strength: 60,
        subGroups: 2,
        displayName: 'CE A',
        homeRoom: 'CB-101',
      },
    ],
  },
  {
    kind: 'students',
    file: '07-students.xlsx',
    sheet: 'Students',
    note: 'Ten fictional students of CE A, split into the two lab groups.',
    rows: Array.from({ length: 10 }, (_, i) => {
      const n = i + 1;
      const names = [
        'Aman Bedi',
        'Simran Kaur',
        'Rahul Nanda',
        'Ishita Arora',
        'Karan Sethi',
        'Meera Bhalla',
        'Vikram Chawla',
        'Tanya Ahuja',
        'Rohit Bansal',
        'Kavya Dhillon',
      ];
      return {
        classRollNo: `CE26${String(n).padStart(3, '0')}`,
        universityRollNo: `2626${String(n).padStart(3, '0')}`,
        name: names[i]!,
        email: `ce26${String(n).padStart(3, '0')}@students.example.edu`,
        programme: 'BTECH',
        branch: 'CE',
        admissionYear: 2026,
        entry: 'Regular',
        section: 'A',
        subGroup: n <= 5 ? 'A1' : 'A2',
      };
    }),
  },
  {
    kind: 'holidays',
    file: '08-holidays.xlsx',
    sheet: 'Holidays',
    note: 'A department event and an institute holiday.',
    rows: [
      { startDate: '2026-11-20', name: 'Civil Engineering Day', department: 'CE' },
      { startDate: '2026-12-25', name: 'Christmas' },
    ],
  },
  {
    kind: 'teaching_assignments',
    file: '09-who-teaches-what.xlsx',
    sheet: 'Who teaches what',
    note: 'Teachers for every lecture, tutorial and lab of CE S1. Labs are taught per lab group. Choose the current term when you upload.',
    rows: [
      { class: 'CE S1', section: 'A', course: 'CE101', component: 'L', teacher: 'CRM' },
      { class: 'CE S1', section: 'A', course: 'CE101', component: 'T', teacher: 'CRM' },
      { class: 'CE S1', section: 'A', course: 'CE102', component: 'L', teacher: 'CNS' },
      {
        class: 'CE S1',
        section: 'A',
        subGroup: 'A1',
        course: 'CE102',
        component: 'P',
        teacher: 'CNS',
      },
      {
        class: 'CE S1',
        section: 'A',
        subGroup: 'A2',
        course: 'CE102',
        component: 'P',
        teacher: 'CAV',
      },
      { class: 'CE S1', section: 'A', course: 'CE103', component: 'L', teacher: 'CPK' },
      {
        class: 'CE S1',
        section: 'A',
        subGroup: 'A1',
        course: 'CE104',
        component: 'P',
        teacher: 'CSG',
      },
      {
        class: 'CE S1',
        section: 'A',
        subGroup: 'A2',
        course: 'CE104',
        component: 'P',
        teacher: 'CAV',
      },
    ],
  },
];

/** Drop-downs in the master workbook that pick from another sheet: kind → column key → source. */
const LINKS: Partial<
  Record<ImportKindName, Record<string, { sheet: ImportKindName; key: string }>>
> = {
  programmes: { branchDepartment: { sheet: 'departments', key: 'code' } },
  courses: { department: { sheet: 'departments', key: 'code' } },
  rooms: { ownerDepartment: { sheet: 'departments', key: 'code' } },
  faculty: { department: { sheet: 'departments', key: 'code' } },
  batches_sections: { homeRoom: { sheet: 'rooms', key: 'code' } },
  holidays: { department: { sheet: 'departments', key: 'code' } },
  teaching_assignments: {
    course: { sheet: 'courses', key: 'code' },
    teacher: { sheet: 'faculty', key: 'shortCode' },
  },
};

/** Every value must be allowed by the template (required present, choices from the list). */
function check(kind: ImportKindName, rows: Row[]): void {
  const t = IMPORT_TEMPLATES[kind];
  const keys = new Set(t.columns.map((c) => c.key));
  rows.forEach((row, i) => {
    for (const k of Object.keys(row)) {
      if (!keys.has(k)) throw new Error(`${kind} row ${i + 2}: unknown column ${k}`);
    }
    for (const c of t.columns) {
      const v = row[c.key];
      if (c.required && (v === undefined || v === '')) {
        throw new Error(`${kind} row ${i + 2}: ${c.label} is required`);
      }
      if (c.values && v !== undefined && v !== '' && !c.values.includes(String(v))) {
        throw new Error(
          `${kind} row ${i + 2}: ${c.label} "${v}" is not one of ${c.values.join(', ')}`,
        );
      }
    }
  });
}

const colLetter = (n: number): string =>
  n <= 26
    ? String.fromCharCode(64 + n)
    : colLetter(Math.floor((n - 1) / 26)) + String.fromCharCode(65 + ((n - 1) % 26));

async function main(): Promise<void> {
  const out = join(process.cwd(), '..', '..', 'docs', 'samples', 'full-setup');
  mkdirSync(out, { recursive: true });

  // One upload-ready file per step, built on the app's own template.
  for (const step of STEPS) {
    check(step.kind, step.rows);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(
      (await buildTemplate(IMPORT_TEMPLATES[step.kind])) as unknown as ExcelJS.Buffer,
    );
    const sheet = wb.worksheets[0]!;
    // A reloaded workbook has no column keys, so write by position, from row 2.
    const cols = IMPORT_TEMPLATES[step.kind].columns;
    step.rows.forEach((row, i) => {
      const target = sheet.getRow(i + 2);
      cols.forEach((c, j) => {
        if (row[c.key] !== undefined) target.getCell(j + 1).value = row[c.key]!;
      });
      target.commit();
    });
    writeFileSync(join(out, step.file), Buffer.from(await wb.xlsx.writeBuffer()));
  }

  // The linked master workbook.
  const master = new ExcelJS.Workbook();
  master.creator = 'Slotwise';
  const start = master.addWorksheet('Start here');
  start.columns = [
    { header: 'Step', key: 'n', width: 6 },
    { header: 'Sheet', key: 'sheet', width: 24 },
    { header: 'Upload file', key: 'file', width: 30 },
    { header: 'Rows', key: 'rows', width: 6 },
    { header: 'What it sets up', key: 'note', width: 80 },
  ];
  start.insertRow(1, [
    'Slotwise full setup: Civil Engineering for the Demo Institute (fictional data)',
  ]);
  start.insertRow(2, [
    'Sign in as Institute admin, open Import from Excel and upload the files in this order (each upload reads one sheet). ' +
      'The sheets in this workbook are linked: their drop-downs pick codes from the earlier sheets.',
  ]);
  start.mergeCells('A1:E1');
  start.mergeCells('A2:E2');
  start.getRow(1).font = { bold: true, size: 14 };
  start.getRow(2).alignment = { wrapText: true };
  start.getRow(2).height = 34;
  start.getRow(3).font = { bold: true };
  STEPS.forEach((s, i) => {
    const r = start.addRow({
      n: i + 1,
      sheet: s.sheet,
      file: s.file,
      rows: s.rows.length,
      note: s.note,
    });
    r.getCell('sheet').value = { text: s.sheet, hyperlink: `#'${s.sheet}'!A1` };
    r.getCell('sheet').font = { color: { argb: 'FF1D4ED8' }, underline: true };
  });

  const ranges = new Map<string, string>();
  for (const step of STEPS) {
    const t = IMPORT_TEMPLATES[step.kind];
    const ws = master.addWorksheet(step.sheet, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = t.columns.map((c) => ({
      header: c.label,
      key: c.key,
      width: Math.max(12, c.label.length + 4, c.example.length + 2),
    }));
    ws.getRow(1).font = { bold: true };
    t.columns.forEach((c, i) => {
      const cell = ws.getRow(1).getCell(i + 1);
      cell.note = `${c.required ? 'Required. ' : ''}${c.help}`;
      if (c.required)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
      ranges.set(
        `${step.kind}.${c.key}`,
        `'${step.sheet}'!$${colLetter(i + 1)}$2:$${colLetter(i + 1)}$500`,
      );
    });
    for (const row of step.rows) ws.addRow(row);
    t.columns.forEach((c, i) => {
      const link = LINKS[step.kind]?.[c.key];
      const formula = link
        ? ranges.get(`${link.sheet}.${link.key}`)
        : c.values
          ? `"${c.values.join(',')}"`
          : null;
      if (!formula) return;
      const letter = colLetter(i + 1);
      for (let r = 2; r <= 200; r++) {
        ws.getCell(`${letter}${r}`).dataValidation = {
          type: 'list',
          allowBlank: !c.required,
          formulae: [formula],
        };
      }
    });
  }
  writeFileSync(
    join(out, 'Slotwise-Full-Setup.xlsx'),
    Buffer.from(await master.xlsx.writeBuffer()),
  );
  console.log(`Wrote ${STEPS.length + 1} files to ${out}`);
}

void main();
