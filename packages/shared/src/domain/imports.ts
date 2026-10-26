/**
 * Excel/CSV import templates (milestone 1d, ADR 0011). One template per kind of master data:
 * its columns, the names colleges already use for them, what to type, and an example row.
 * The API builds the .xlsx template and its "How to fill" sheet from these, and reads uploads
 * with matchHeaders(); the web shows the same column labels in the preview.
 *
 * Cell values are kept as text until a row is checked, so a row can be fixed inline.
 */
import { normaliseHeader, type TemplateColumn } from './headers';

export const IMPORT_KINDS = [
  'departments',
  'programmes',
  'batches_sections',
  'students',
  'faculty',
  'rooms',
  'courses',
  'holidays',
  'teaching_assignments',
] as const;
export type ImportKindName = (typeof IMPORT_KINDS)[number];

export interface ImportColumn extends TemplateColumn {
  /** One line for the "How to fill" sheet. */
  help: string;
  /** The example row's value. */
  example: string;
  /** Allowed values, shown in the template as a drop-down. */
  values?: readonly string[];
}

export interface ImportTemplate {
  kind: ImportKindName;
  title: string;
  /** What one row is, for the "How to fill" sheet. */
  rowIs: string;
  /** Whether rows belong to a term (sections, teaching) or may use one (students). */
  term: 'required' | 'optional' | 'none';
  /** Columns that identify a row; importing the same key again updates it. */
  key: readonly string[];
  columns: readonly ImportColumn[];
}

/** Files with more rows than this are read and committed in the background. */
export const IMPORT_BACKGROUND_ROWS = 1000;
/** Largest file accepted. */
export const IMPORT_MAX_ROWS = 20_000;
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

const col = (
  key: string,
  label: string,
  help: string,
  example: string,
  extra: Partial<ImportColumn> = {},
): ImportColumn => ({ key, label, help, example, ...extra });

const YES_NO = ['Yes', 'No'] as const;

export const IMPORT_TEMPLATES: Readonly<Record<ImportKindName, ImportTemplate>> = {
  departments: {
    kind: 'departments',
    title: 'Departments',
    rowIs: 'one department',
    term: 'none',
    key: ['code'],
    columns: [
      col('code', 'Code', 'Short code, e.g. CSE. Used by the other sheets.', 'CSE', {
        required: true,
        synonyms: ['Dept Code', 'Department Code', 'Short Name'],
      }),
      col('name', 'Name', 'Full name of the department.', 'Computer Science and Engineering', {
        required: true,
        synonyms: ['Department', 'Department Name', 'Dept Name', 'Dept'],
      }),
      col(
        'kind',
        'Kind',
        'Teaching, or Service for departments that only teach others (Applied Sciences). Blank = Teaching.',
        'Teaching',
        { values: ['Teaching', 'Service'], synonyms: ['Type'] },
      ),
    ],
  },
  programmes: {
    kind: 'programmes',
    title: 'Programmes and branches',
    rowIs:
      'one branch of a programme. Repeat the programme on each branch row. Leave Branch code blank for programmes without branches (MBA, BCA).',
    term: 'none',
    key: ['code', 'branchCode'],
    columns: [
      col('code', 'Programme code', 'e.g. BTECH, MBA.', 'BTECH', {
        required: true,
        synonyms: ['Programme', 'Program', 'Program Code', 'Course'],
      }),
      col('name', 'Programme name', 'e.g. B.Tech.', 'B.Tech', {
        required: true,
        synonyms: ['Programme Name', 'Program Name', 'Degree'],
      }),
      col('level', 'Level', 'UG, PG, Diploma or Doctoral.', 'UG', {
        required: true,
        values: ['UG', 'PG', 'Diploma', 'Doctoral'],
      }),
      col('totalSemesters', 'Semesters', 'How many semesters the programme has.', '8', {
        required: true,
        synonyms: ['Total Semesters', 'No of Semesters', 'Duration (semesters)'],
      }),
      col(
        'lateralEntrySemester',
        'Lateral entry semester',
        'Semester lateral-entry (LEET) students join in, e.g. 3. Blank = no lateral entry.',
        '3',
        { synonyms: ['LEET Semester', 'Lateral Entry'] },
      ),
      col(
        'department',
        'Department',
        'Department code that runs the programme. Needed when it has no branches; blank for B.Tech.',
        '',
        { synonyms: ['Dept', 'Department Code'] },
      ),
      col('branchCode', 'Branch code', 'e.g. CSE. Blank = no branches.', 'CSE', {
        synonyms: ['Branch', 'Specialisation', 'Specialization'],
      }),
      col(
        'branchName',
        'Branch name',
        'e.g. Computer Science and Engineering.',
        'Computer Science and Engineering',
        {
          synonyms: ['Branch Title'],
        },
      ),
      col(
        'branchDepartment',
        'Branch department',
        'Department code the branch belongs to. Blank = same as Branch code.',
        'CSE',
        { synonyms: ['Branch Dept'] },
      ),
    ],
  },
  batches_sections: {
    kind: 'batches_sections',
    title: 'Batches and sections',
    rowIs:
      'one section of a batch in the chosen term. The batch is created if it is new. Sections get sub-groups of equal size.',
    term: 'required',
    key: ['programme', 'branch', 'admissionYear', 'entry', 'section'],
    columns: [
      col('programme', 'Programme', 'Programme code, e.g. BTECH.', 'BTECH', {
        required: true,
        synonyms: ['Programme Code', 'Program', 'Course'],
      }),
      col(
        'branch',
        'Branch',
        'Branch code, e.g. CSE. Blank for programmes without branches.',
        'CSE',
        {
          synonyms: ['Branch Code', 'Specialisation'],
        },
      ),
      col('admissionYear', 'Admission year', 'Year the batch joined, e.g. 2025.', '2025', {
        required: true,
        synonyms: ['Batch', 'Year of Admission', 'Admission Batch', 'Session'],
      }),
      col('entry', 'Entry', 'Regular or LEET (lateral entry). Blank = Regular.', 'Regular', {
        values: ['Regular', 'LEET'],
        synonyms: ['Entry Type', 'Lateral'],
      }),
      col(
        'scheme',
        'Scheme',
        'Scheme name the batch follows, e.g. Scheme 2024. Needed for a new batch.',
        'Scheme 2024',
        {
          synonyms: ['Scheme Version', 'Syllabus Scheme'],
        },
      ),
      col('section', 'Section', 'Section name, e.g. A.', 'A', {
        required: true,
        synonyms: ['Section Name', 'Sec', 'Class Section'],
      }),
      col('strength', 'Strength', 'Number of students in the section.', '60', {
        required: true,
        synonyms: ['Students', 'No of Students', 'Strength of Section', 'Size'],
      }),
      col(
        'subGroups',
        'Sub-groups',
        'How many lab groups, e.g. 2 makes A1 and A2. Blank = 2.',
        '2',
        {
          synonyms: ['Groups', 'Lab Groups', 'Batches per Section'],
        },
      ),
      col(
        'displayName',
        'Name in timetables',
        'e.g. CS A. Blank = branch code and section.',
        'CS A',
        {
          synonyms: ['Display Name'],
        },
      ),
      col('homeRoom', 'Home room', 'Room code where the section usually sits. Optional.', 'G16', {
        synonyms: ['Room', 'Class Room', 'Classroom'],
      }),
    ],
  },
  students: {
    kind: 'students',
    title: 'Students',
    rowIs: 'one student. Their batch must exist already (import batches and sections first).',
    term: 'optional',
    key: ['classRollNo'],
    columns: [
      col(
        'classRollNo',
        'Class roll no',
        'The roll number used in class. Must be unique.',
        '2315001',
        {
          required: true,
          synonyms: ['Roll No', 'Roll Number', 'Class Roll Number', 'CRN'],
        },
      ),
      col('universityRollNo', 'University roll no', 'Optional.', '2315001', {
        synonyms: ['URN', 'University Roll Number', 'Univ Roll No', 'Registration No'],
      }),
      col('name', 'Name', 'Student’s full name.', 'Aarav Example', {
        required: true,
        synonyms: ['Student Name', 'Full Name', 'Name of Student'],
      }),
      col('email', 'Email', 'Optional. Used to send their sign-in code.', 'aarav@example.edu', {
        synonyms: ['Email ID', 'E-mail', 'Mail'],
      }),
      col('phone', 'Phone', 'Optional.', '9800000000', {
        synonyms: ['Mobile', 'Mobile No', 'Contact', 'Phone Number'],
      }),
      col('programme', 'Programme', 'Programme code, e.g. BTECH.', 'BTECH', {
        required: true,
        synonyms: ['Programme Code', 'Program', 'Course'],
      }),
      col('branch', 'Branch', 'Branch code. Blank for programmes without branches.', 'CSE', {
        synonyms: ['Branch Code', 'Specialisation'],
      }),
      col('admissionYear', 'Admission year', 'e.g. 2025.', '2025', {
        required: true,
        synonyms: ['Batch', 'Year of Admission', 'Admission Batch'],
      }),
      col('entry', 'Entry', 'Regular or LEET. Blank = Regular.', 'Regular', {
        values: ['Regular', 'LEET'],
        synonyms: ['Entry Type'],
      }),
      col('section', 'Section', 'Section name in the chosen term, e.g. A. Optional.', 'A', {
        synonyms: ['Sec', 'Section Name'],
      }),
      col('subGroup', 'Sub-group', 'Lab group, e.g. A1. Optional.', 'A1', {
        synonyms: ['Group', 'Lab Group', 'Sub Group'],
      }),
    ],
  },
  faculty: {
    kind: 'faculty',
    title: 'Faculty',
    rowIs: 'one teacher.',
    term: 'none',
    key: ['employeeCode'],
    columns: [
      col('employeeCode', 'Employee code', 'Unique staff number.', 'E1001', {
        required: true,
        synonyms: ['Emp Code', 'Employee No', 'Employee ID', 'Staff ID', 'Faculty Code', 'Emp ID'],
      }),
      col('name', 'Name', 'Full name with title, e.g. Dr. Asha Example.', 'Dr. Asha Example', {
        required: true,
        synonyms: ['Faculty Name', 'Teacher', 'Teacher Name', 'Name of Faculty'],
      }),
      col(
        'shortCode',
        'Short code',
        'Initials shown in timetables, e.g. AE. Must be unique.',
        'AE',
        {
          required: true,
          synonyms: ['Initials', 'Abbreviation', 'Short Name'],
        },
      ),
      col('email', 'Email', 'Optional. Used to invite them.', 'asha@example.edu', {
        synonyms: ['Email ID', 'E-mail', 'Mail'],
      }),
      col(
        'designation',
        'Designation',
        'Professor, Associate Professor, Assistant Professor, Lecturer, Teaching Assistant or Visiting.',
        'Assistant Professor',
        {
          required: true,
          values: [
            'Professor',
            'Associate Professor',
            'Assistant Professor',
            'Lecturer',
            'Teaching Assistant',
            'Visiting',
          ],
          synonyms: ['Post', 'Rank'],
        },
      ),
      col(
        'experience',
        'Experience',
        'Experienced or Fresher. Blank = Experienced.',
        'Experienced',
        {
          values: ['Experienced', 'Fresher'],
        },
      ),
      col('department', 'Department', 'Home department code, e.g. CSE.', 'CSE', {
        required: true,
        synonyms: ['Dept', 'Home Department', 'Department Code'],
      }),
      col(
        'otherDepartments',
        'Also teaches in',
        'Other department codes, separated by commas. Optional.',
        'IT',
        { synonyms: ['Other Departments', 'Teaches In'] },
      ),
      col('maxPeriodsPerDay', 'Max periods a day', 'Blank = 4 (experienced) or 5 (fresher).', '', {
        synonyms: ['Max per Day', 'Periods per Day', 'Daily Load'],
      }),
      col(
        'maxPeriodsPerWeek',
        'Max periods a week',
        'Blank = 14 (experienced) or 18 (fresher).',
        '',
        {
          synonyms: ['Max per Week', 'Periods per Week', 'Weekly Load', 'Workload'],
        },
      ),
    ],
  },
  rooms: {
    kind: 'rooms',
    title: 'Rooms',
    rowIs: 'one room or lab. New buildings are created by name.',
    term: 'none',
    key: ['code'],
    columns: [
      col('code', 'Room code', 'e.g. G16, SL-IV LAB. Must be unique.', 'G16', {
        required: true,
        synonyms: ['Room', 'Room No', 'Room Number', 'Lab'],
      }),
      col('building', 'Building', 'Building or block name.', 'Main Block', {
        required: true,
        synonyms: ['Block', 'Building Name', 'Wing'],
      }),
      col('floor', 'Floor', '0 = ground floor. Blank = 0.', '0'),
      col('type', 'Type', 'Lecture, Tutorial, Lab, Seminar, Drawing hall or Workshop.', 'Lecture', {
        required: true,
        values: ['Lecture', 'Tutorial', 'Lab', 'Seminar', 'Drawing hall', 'Workshop'],
        synonyms: ['Room Type'],
      }),
      col(
        'labCategories',
        'Lab category',
        'For labs, e.g. Software lab. Several separated by commas.',
        '',
        {
          synonyms: ['Lab Type', 'Lab Categories'],
        },
      ),
      col('rows', 'Rows', 'Rows of benches. Optional.', '10'),
      col('seatsPerRow', 'Seats per row', 'Optional. Capacity = rows × seats per row.', '6', {
        synonyms: ['Seats in a Row'],
      }),
      col('capacity', 'Capacity', 'Only if rows × seats per row is not right.', '', {
        synonyms: ['Seating Capacity', 'Seats', 'Strength'],
      }),
      col(
        'examSeatsPerBench',
        'Exam seats per bench',
        'Students per bench in exams. Optional.',
        '1',
        {
          synonyms: ['Exam Seats'],
        },
      ),
      col(
        'ownerDepartment',
        'Owner department',
        'Department code that owns the room. Optional.',
        '',
        {
          synonyms: ['Department', 'Dept'],
        },
      ),
      col('isShared', 'Shared', 'Yes if any department may use it. Blank = Yes.', 'Yes', {
        values: YES_NO,
      }),
      col(
        'isAccessible',
        'Accessible',
        'Yes if on the ground floor or reachable by lift. Blank = No.',
        'Yes',
        {
          values: YES_NO,
          synonyms: ['Wheelchair Accessible', 'Ground Floor'],
        },
      ),
    ],
  },
  courses: {
    kind: 'courses',
    title: 'Courses (scheme)',
    rowIs: 'one course of a scheme. A new scheme name creates a draft scheme.',
    term: 'none',
    key: ['programme', 'scheme', 'code'],
    columns: [
      col('programme', 'Programme', 'Programme code, e.g. BTECH.', 'BTECH', {
        required: true,
        synonyms: ['Programme Code', 'Program'],
      }),
      col('scheme', 'Scheme', 'Scheme name, e.g. Scheme 2024.', 'Scheme 2024', {
        required: true,
        synonyms: ['Scheme Version', 'Scheme Name', 'Batch Scheme'],
      }),
      col('semester', 'Semester', 'e.g. 3.', '3', { required: true, synonyms: ['Sem'] }),
      col('code', 'Course code', 'e.g. CS301.', 'CS301', {
        required: true,
        synonyms: ['Subject Code', 'Paper Code', 'Code'],
      }),
      col('title', 'Title', 'Course name.', 'Data Structures', {
        required: true,
        synonyms: ['Subject', 'Subject Name', 'Course Name', 'Course Title', 'Paper'],
      }),
      col('shortName', 'Short name', 'Shown in timetables, e.g. DS.', 'DS', {
        required: true,
        synonyms: ['Abbreviation', 'Short Form', 'Subject Short Name'],
      }),
      col('lectures', 'L', 'Lecture periods a week.', '3', { synonyms: ['Lecture', 'Lectures'] }),
      col('tutorials', 'T', 'Tutorial periods a week.', '1', {
        synonyms: ['Tutorial', 'Tutorials'],
      }),
      col('practicals', 'P', 'Practical periods a week.', '2', {
        synonyms: ['Practical', 'Practicals', 'Lab'],
      }),
      col('credits', 'Credits', 'Only if not L + T + P/2.', '', { synonyms: ['Credit'] }),
      col('syllabusHours', 'Syllabus hours', 'Contact hours in the semester. Optional.', '45', {
        synonyms: ['Contact Hours', 'Hours'],
      }),
      col(
        'type',
        'Type',
        'Core, Programme elective, Open elective, Mandatory, Audit, Lab, Project, Seminar, Training or MOOC. Blank = Core.',
        'Core',
        {
          values: [
            'Core',
            'Programme elective',
            'Open elective',
            'Mandatory',
            'Audit',
            'Lab',
            'Project',
            'Seminar',
            'Training',
            'MOOC',
          ],
          synonyms: ['Course Type', 'Category'],
        },
      ),
      col(
        'electiveGroup',
        'Elective group',
        'Courses in the same group run at the same time, e.g. Elective-IV.',
        '',
        {
          synonyms: ['Elective', 'Group'],
        },
      ),
      col(
        'department',
        'Offering department',
        'Department code that teaches it, e.g. CSE.',
        'CSE',
        {
          required: true,
          synonyms: ['Department', 'Dept', 'Teaching Department'],
        },
      ),
      col(
        'labCategory',
        'Lab category',
        'For practicals, e.g. Software lab. Optional.',
        'Software lab',
        {
          synonyms: ['Lab', 'Lab Type'],
        },
      ),
      col('labBlockLength', 'Lab block', 'Periods in one lab session, 1 to 4. Blank = 2.', '2', {
        synonyms: ['Lab Block Length', 'Lab Periods'],
      }),
      col(
        'branches',
        'Branches',
        'Branch codes separated by commas. Blank = all branches.',
        'CSE',
        {
          synonyms: ['Branch', 'For Branches'],
        },
      ),
    ],
  },
  holidays: {
    kind: 'holidays',
    title: 'Holidays',
    rowIs: 'one holiday or a range of days.',
    term: 'none',
    key: ['startDate', 'name'],
    columns: [
      col('startDate', 'Date', 'e.g. 20-10-2026 or 2026-10-20.', '2026-10-20', {
        required: true,
        synonyms: ['From', 'Start Date', 'Holiday Date', 'From Date'],
      }),
      col('endDate', 'Until', 'Last day for a range. Blank = one day.', '', {
        synonyms: ['To', 'End Date', 'To Date'],
      }),
      col('name', 'Holiday', 'e.g. Dussehra.', 'Dussehra', {
        required: true,
        synonyms: ['Name', 'Occasion', 'Festival', 'Description'],
      }),
      col(
        'department',
        'Only for department',
        'Department code if the holiday is only for one department. Blank = whole institute.',
        '',
        { synonyms: ['Department', 'Dept'] },
      ),
    ],
  },
  teaching_assignments: {
    kind: 'teaching_assignments',
    title: 'Teaching assignments',
    rowIs:
      'who teaches the L, T or P of a course to one section or sub-group in the chosen term (the subject distribution).',
    term: 'required',
    key: ['course', 'component', 'class', 'section', 'subGroup'],
    columns: [
      col('class', 'Class', 'Class code as on the Cohorts page, e.g. CSE S3.', 'CSE S3', {
        required: true,
        synonyms: ['Cohort', 'Semester Class', 'Class Code'],
      }),
      col('section', 'Section', 'Section name, e.g. A.', 'A', {
        required: true,
        synonyms: ['Sec', 'Section Name'],
      }),
      col(
        'subGroup',
        'Sub-group',
        'For T or P taught to a lab group, e.g. A1. Blank = whole section.',
        '',
        {
          synonyms: ['Group', 'Lab Group', 'Sub Group'],
        },
      ),
      col('course', 'Course code', 'e.g. CS301.', 'CS301', {
        required: true,
        synonyms: ['Subject Code', 'Paper Code', 'Course', 'Subject'],
      }),
      col('component', 'L/T/P', 'L, T or P.', 'L', {
        required: true,
        values: ['L', 'T', 'P'],
        synonyms: ['Component', 'Type', 'Lecture/Tutorial/Practical'],
      }),
      col('teacher', 'Teacher', 'Short code or employee code, e.g. AE.', 'AE', {
        required: true,
        synonyms: ['Faculty', 'Teacher Code', 'Faculty Code', 'Taught By'],
      }),
      col(
        'coTeachers',
        'Co-teachers',
        'Other teachers’ codes, separated by commas. Optional.',
        '',
        {
          synonyms: ['Co-teacher', 'Assistant', 'Lab Assistant'],
        },
      ),
    ],
  },
};

// ---- Cell values ---------------------------------------------------------------------------

/** A cell as the API reads it: text after trimming; dates as yyyy-mm-dd. */
export type CellText = string;

export interface CellProblem {
  /** Template column key, or null for the whole row. */
  column: string | null;
  message: string;
}

export const blank = (v: CellText | undefined): boolean => v == null || v.trim() === '';

/** Whole number; null for blank, undefined (with a problem) for bad input. */
export function parseWhole(v: CellText | undefined): number | null | undefined {
  if (blank(v)) return null;
  const s = v!.trim().replace(/,/g, '');
  if (!/^-?\d+(\.0+)?$/.test(s)) return undefined;
  return Number.parseInt(s, 10);
}

export function parseDecimal(v: CellText | undefined): number | null | undefined {
  if (blank(v)) return null;
  const n = Number(v!.trim().replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

const YES = new Set(['yes', 'y', 'true', '1', 'haan', 'ha']);
const NO = new Set(['no', 'n', 'false', '0', 'nahi']);

export function parseYesNo(v: CellText | undefined): boolean | null | undefined {
  if (blank(v)) return null;
  const s = normaliseHeader(v!);
  if (YES.has(s)) return true;
  if (NO.has(s)) return false;
  return undefined;
}

/** "CSE, IT; ME" → ["CSE", "IT", "ME"] */
export function parseList(v: CellText | undefined): string[] {
  if (blank(v)) return [];
  return v!
    .split(/[,;/\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Matches a cell to one of `options` by value or by any of its names, ignoring case,
 * spaces and punctuation ("Asst. Prof" → assistant_professor via its names).
 */
export function parseChoice<T extends string>(
  v: CellText | undefined,
  options: Readonly<Record<T, readonly string[]>>,
): T | null | undefined {
  if (blank(v)) return null;
  const s = normaliseHeader(v!);
  for (const [value, names] of Object.entries(options) as [T, readonly string[]][]) {
    if (normaliseHeader(value) === s) return value;
    if (names.some((n) => normaliseHeader(n) === s)) return value;
  }
  return undefined;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function isoOf(y: number, m: number, d: number): string | undefined {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * A date as Indian sheets write it: 2026-10-20, 20-10-2026, 20/10/2026, 20.10.26,
 * 20 Oct 2026, 20-Oct-2026. Day comes before month (dd/mm), as in India.
 */
export function parseDate(v: CellText | undefined): string | null | undefined {
  if (blank(v)) return null;
  const s = v!.trim().toLowerCase();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return isoOf(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = Number(m[3]);
    return isoOf(y < 100 ? 2000 + y : y, Number(m[2]), Number(m[1]));
  }
  m = /^(\d{1,2})[-\s/.]*([a-z]{3})[a-z]*[-\s/.,]*(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const month = MONTHS.indexOf(m[2]!) + 1;
    const y = Number(m[3]);
    return month > 0 ? isoOf(y < 100 ? 2000 + y : y, month, Number(m[1])) : undefined;
  }
  return undefined;
}

/** The natural key of a row (lower case, so "cse" and "CSE" are the same row). */
export function rowKey(template: ImportTemplate, data: Readonly<Record<string, CellText>>): string {
  return template.key.map((k) => (data[k] ?? '').trim().toLowerCase()).join('|');
}

/** Row values for the template columns from a file row, using a mapping from matchHeaders(). */
export function mapRow(
  template: ImportTemplate,
  mapping: Readonly<Record<string, number>>,
  cells: readonly CellText[],
): Record<string, CellText> {
  const data: Record<string, CellText> = {};
  for (const c of template.columns) {
    const index = mapping[c.key];
    data[c.key] = index == null ? '' : (cells[index] ?? '').trim();
  }
  return data;
}
