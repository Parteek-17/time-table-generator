/**
 * Excel/CSV import (milestone 1d, ADR 0011): templates, upload → matched columns → preview
 * with plain-language problems → inline fix or skip → commit → summary; re-import updates by
 * natural key; one transaction per commit; permissions per row; big files in the background.
 */
import { connect } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import type {
  ImportJobDto,
  ImportKindName,
  ImportRowDto,
  ImportRowsPageDto,
  ImportTemplateFileDto,
} from '@slotwise/shared';
import { IMPORT_KINDS, IMPORT_TEMPLATES } from '@slotwise/shared';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, Fixtures, signToken } from './helpers';

function reachable(url: string, fallbackPort: number): Promise<boolean> {
  const u = new URL(url);
  return new Promise((resolve) => {
    const socket = connect({ host: u.hostname, port: Number(u.port || fallbackPort) });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1000, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

// Big files are read on the p1.imports queue (requests/2026-10-26-p1-redis-in-ci.md).
const NO_REDIS = 'needs Redis for the imports queue';
let hasRedis = false;

let app: INestApplication;
const fx = new Fixtures();
const tokens = new Map<string, string>();
let a: Awaited<ReturnType<Fixtures['institute']>>;
const u = {} as Record<'admin' | 'hod' | 'faculty', { id: string }>;

function as(userId: string) {
  const http = request(app.getHttpServer());
  const prep = (req: request.Test) =>
    req
      .set('x-institute-slug', a.institute.slug)
      .set('authorization', `Bearer ${tokens.get(userId)}`);
  return {
    get: (path: string) => prep(http.get(path)),
    put: (path: string, body?: object) => prep(http.put(path)).send(body),
    post: (path: string, body?: object) => prep(http.post(path)).send(body),
    upload: (kind: ImportKindName, fileName: string, file: Buffer | string, termId?: string) =>
      prep(
        http.post(
          `/imports?${new URLSearchParams({ kind, fileName, ...(termId ? { termId } : {}) }).toString()}`,
        ),
      )
        .set('content-type', 'application/octet-stream')
        .send(Buffer.isBuffer(file) ? file : Buffer.from(file, 'utf8')),
  };
}

async function upload(
  kind: ImportKindName,
  fileName: string,
  file: Buffer | string,
  termId?: string,
): Promise<ImportJobDto> {
  const res = await as(u.admin.id).upload(kind, fileName, file, termId);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as ImportJobDto;
}

async function rows(id: string, show = 'all', userId = u.admin.id): Promise<ImportRowDto[]> {
  const res = await as(userId).get(`/imports/${id}/rows?show=${show}`);
  expect(res.status).toBe(200);
  return (res.body as ImportRowsPageDto).rows;
}

async function commit(id: string, userId = u.admin.id): Promise<ImportJobDto> {
  const res = await as(userId).post(`/imports/${id}/commit`);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as ImportJobDto;
}

async function xlsx(rowsOfCells: (string | number | Date | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Sheet1');
  for (const r of rowsOfCells) sheet.addRow(r);
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

const csv = (lines: string[]) => lines.join('\r\n');

beforeAll(async () => {
  // Use the compose "storage" service when it runs; otherwise files go to a temp folder.
  if (!process.env.S3_ENDPOINT && (await reachable('http://localhost:9000', 9000))) {
    Object.assign(process.env, {
      S3_ENDPOINT: 'http://localhost:9000',
      S3_BUCKET: 'slotwise-test',
      S3_ACCESS_KEY_ID: 'slotwise',
      S3_SECRET_ACCESS_KEY: 'slotwise-dev-storage',
      S3_FORCE_PATH_STYLE: 'true',
    });
  }
  let env;
  ({ app, env } = await createTestApp());
  hasRedis = await reachable(env.REDIS_URL, 6379);
  a = await fx.institute('imports');
  for (const key of ['admin', 'hod', 'faculty'] as const) {
    u[key] = await fx.user(`imports-${key}`);
    tokens.set(u[key].id, await signToken(env, u[key].id));
  }
  await fx.grant(u.admin.id, 'institute_admin', a.institute.id, { type: 'institute' });
  await fx.grant(u.hod.id, 'hod', a.institute.id, { type: 'department', id: a.cse.id });
  await fx.grant(u.faculty.id, 'faculty', a.institute.id, { type: 'department', id: a.cse.id });
}, 60_000);

afterAll(async () => {
  await app?.close();
  await fx.cleanup();
});

describe('templates', () => {
  it('gives an .xlsx for each of the 9 kinds with the columns and a "How to fill" sheet', async () => {
    for (const kind of IMPORT_KINDS) {
      const res = await as(u.admin.id).get(`/imports/templates/${kind}`);
      expect(res.status, kind).toBe(200);
      const body = res.body as ImportTemplateFileDto;
      expect(body.fileName).toMatch(/\.xlsx$/);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(body.contentBase64, 'base64') as unknown as ExcelJS.Buffer);
      expect(wb.worksheets.map((s) => s.name)).toEqual([
        IMPORT_TEMPLATES[kind].title,
        'How to fill',
      ]);
      const headers = (wb.worksheets[0]!.getRow(1).values as unknown[]).slice(1);
      expect(headers).toEqual(IMPORT_TEMPLATES[kind].columns.map((c) => c.label));
      const help = wb.getWorksheet('How to fill')!;
      expect(help.rowCount).toBe(3 + IMPORT_TEMPLATES[kind].columns.length);
    }
  });

  it('is only for people who may import', async () => {
    expect((await as(u.faculty.id).get('/imports/templates/faculty')).status).toBe(403);
    expect((await as(u.faculty.id).upload('departments', 'd.csv', 'Code,Name\nX,Y')).status).toBe(
      403,
    );
    expect((await as(u.admin.id).get('/imports/templates/nonsense')).status).toBe(400);
  });
});

describe('departments from CSV', () => {
  it('previews creates and updates by code, commits in one go, and audits it', async () => {
    const job = await upload(
      'departments',
      'depts.csv',
      csv([
        'Code,Name,Kind',
        'ME,Mechanical Engineering,Teaching',
        'cse,Computer Science and Engineering,',
        'AS,"Applied Sciences, Humanities",Service',
      ]),
    );
    expect(job).toMatchObject({ status: 'preview', rowCount: 3, missingRequired: [] });
    expect(job.counts).toMatchObject({ problems: 0, create: 2, update: 1, unchanged: 0 });
    const preview = await rows(job.id);
    expect(preview.map((r) => [r.rowNumber, r.action])).toEqual([
      [2, 'create'],
      [3, 'update'],
      [4, 'create'],
    ]);
    expect(preview[2]!.data).toMatchObject({ code: 'AS', name: 'Applied Sciences, Humanities' });

    const done = await commit(job.id);
    expect(done.status).toBe('committed');
    expect(done.summary).toMatchObject({ created: 2, updated: 1, unchanged: 0, skipped: 0 });
    const depts = await fx.owner.department.findMany({
      where: { instituteId: a.institute.id },
      orderBy: { code: 'asc' },
    });
    expect(depts.map((d) => [d.code, d.kind])).toEqual([
      ['AS', 'service'],
      ['CSE', 'teaching'],
      ['ECE', 'teaching'],
      ['ME', 'teaching'],
    ]);
    expect(depts.find((d) => d.code === 'CSE')!.name).toBe('Computer Science and Engineering');
    const audit = await fx.owner.auditLog.findMany({
      where: { instituteId: a.institute.id, targetId: job.id },
    });
    expect(audit.map((x) => x.action).sort()).toEqual(['import.committed', 'import.uploaded']);

    // Committed imports stay as they are.
    expect((await as(u.admin.id).post(`/imports/${job.id}/commit`)).status).toBe(409);
  });

  it('imports the same file again as unchanged', async () => {
    const job = await upload(
      'departments',
      'depts.csv',
      csv(['Code,Name', 'ME,Mechanical Engineering', 'AS,"Applied Sciences, Humanities"']),
    );
    expect(job.counts).toMatchObject({ problems: 0, create: 0, update: 0, unchanged: 2 });
    expect((await commit(job.id)).summary).toMatchObject({ unchanged: 2 });
  });

  it('says what is wrong with a file it cannot read', async () => {
    const empty = await as(u.admin.id).upload('departments', 'd.csv', 'Code,Name\r\n');
    expect(empty.status).toBe(400);
    expect(empty.body.message).toMatch(/no data rows/);
    const pdf = await as(u.admin.id).upload('departments', 'd.pdf', '%PDF-1.4');
    expect(pdf.body.message).toMatch(/Excel \(\.xlsx\) or CSV/);
    const xls = Buffer.alloc(16);
    xls.writeUInt32BE(0xd0cf11e0, 0);
    expect((await as(u.admin.id).upload('departments', 'd.xls', xls)).body.message).toMatch(
      /old Excel/,
    );
    const noTerm = await as(u.admin.id).upload('teaching_assignments', 't.csv', 'Class\nX');
    expect(noTerm.body.message).toMatch(/Choose the term/);
  });
});

describe('faculty from a messy Excel sheet', () => {
  let jobId: string;

  it('finds the header row under a title, matches the college’s own headers, and explains problems', async () => {
    const file = await xlsx([
      ['Faculty list 2026-27'],
      ['S.No', 'Emp. Code', 'Name of Faculty', 'Initials', 'Designation', 'Dept', 'Email ID'],
      [1, 'E1', 'Dr. Asha Example', 'AE', 'Asst. Prof.', 'CSE', 'asha@example.edu'],
      [2, 'E2', 'Ravi Example', 'RE', 'Professor', 'XYZ', ''],
      [3, 'E3', 'Meena Example', 'ME1', 'Dean', 'ECE', 'not-an-email'],
      [4, 'E1', 'Dr. Asha Again', 'AA', 'Professor', 'CSE', ''],
      [5, 'E5', 'Kiran Example', 'AE', 'Lecturer', 'ECE', ''],
    ]);
    const job = await upload('faculty', 'Staff List.xlsx', file);
    jobId = job.id;
    expect(job.headers[1]).toBe('Emp. Code');
    expect(job.mapping).toMatchObject({ employeeCode: 1, name: 2, shortCode: 3, department: 5 });
    expect(job.counts).toMatchObject({ problems: 4, create: 1 });

    const problems = await rows(job.id, 'problems');
    const byRow = new Map(problems.map((r) => [r.rowNumber, r.errors]));
    expect(byRow.get(4)).toEqual([
      { column: 'department', message: 'There is no department with code XYZ. Add it first.' },
    ]);
    expect(byRow.get(5)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column: 'designation',
          message: expect.stringMatching(/“Dean” is not one of: Professor/),
        }),
        expect.objectContaining({ column: 'email', message: 'Enter a valid email address.' }),
      ]),
    );
    expect(byRow.get(6)).toEqual([
      { column: 'employeeCode', message: 'Same as row 3. Remove one of them or skip this row.' },
    ]);
    expect(byRow.get(7)).toEqual([
      {
        column: 'shortCode',
        message: 'AE is already used by Dr. Asha Example. Choose another short code.',
      },
    ]);

    const blocked = await as(u.admin.id).post(`/imports/${job.id}/commit`);
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toBe('4 rows have problems. Fix or skip them first.');
  });

  it('fixes rows inline, skips others, and commits the rest', async () => {
    const fixed = await as(u.admin.id).put(`/imports/${jobId}/rows/4`, {
      data: { department: 'ece' },
    });
    expect(fixed.status).toBe(200);
    expect(fixed.body).toMatchObject({ errors: [], action: 'create', data: { department: 'ece' } });
    const two = await as(u.admin.id).put(`/imports/${jobId}/rows/5`, {
      data: { designation: 'Associate Professor', email: '' },
    });
    expect(two.body.errors).toEqual([]);
    await as(u.admin.id).put(`/imports/${jobId}/rows/6`, { skip: true }).expect(200);
    const renamed = await as(u.admin.id).put(`/imports/${jobId}/rows/7`, {
      data: { shortCode: 'KE' },
    });
    expect(renamed.body.errors).toEqual([]);

    const done = await commit(jobId);
    expect(done.summary).toMatchObject({ created: 4, skipped: 1 });
    const staff = await fx.owner.faculty.findMany({
      where: { instituteId: a.institute.id },
      orderBy: { employeeCode: 'asc' },
    });
    expect(staff.map((f) => [f.employeeCode, f.shortCode, f.designation])).toEqual([
      ['E1', 'AE', 'assistant_professor'],
      ['E2', 'RE', 'professor'],
      ['E3', 'ME1', 'associate_professor'],
      ['E5', 'KE', 'lecturer'],
    ]);
    // Load limits default by experience.
    expect(staff[0]).toMatchObject({ maxPeriodsPerDay: 4, maxPeriodsPerWeek: 14 });
    expect(
      await fx.owner.auditLog.count({
        where: { instituteId: a.institute.id, action: 'faculty.created' },
      }),
    ).toBe(4);
  });

  it('updates by employee code and keeps values the file leaves blank', async () => {
    const job = await upload(
      'faculty',
      'update.csv',
      csv([
        'Employee code,Name,Short code,Designation,Department,Max periods a week',
        'E1,Dr. Asha Example,AE,Associate Professor,CSE,12',
      ]),
    );
    expect(job.counts).toMatchObject({ update: 1, problems: 0 });
    await commit(job.id);
    const asha = await fx.owner.faculty.findFirstOrThrow({
      where: { instituteId: a.institute.id, employeeCode: 'E1' },
    });
    expect(asha).toMatchObject({
      designation: 'associate_professor',
      maxPeriodsPerWeek: 12,
      maxPeriodsPerDay: 4,
      email: 'asha@example.edu',
    });
  });

  it('lets the admin pick a column it could not match', async () => {
    const job = await upload(
      'faculty',
      'odd.csv',
      csv(['Emp Code,Teacher,Tag,Post,Dept', 'E9,Nisha Example,NE,Lecturer,CSE']),
    );
    expect(job.status).toBe('mapping');
    expect(job.missingRequired).toEqual(['shortCode']);
    expect(await rows(job.id)).toEqual([]);
    expect((await as(u.admin.id).post(`/imports/${job.id}/commit`)).status).toBe(409);

    const twice = await as(u.admin.id).put(`/imports/${job.id}/mapping`, {
      mapping: { ...job.mapping, shortCode: 0 },
    });
    expect(twice.status).toBe(400);
    expect(twice.body.message).toMatch(/chosen twice/);

    const res = await as(u.admin.id).put(`/imports/${job.id}/mapping`, {
      mapping: { ...job.mapping, shortCode: 2 },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'preview', missingRequired: [] });
    expect((await rows(job.id))[0]!.data).toMatchObject({ shortCode: 'NE', name: 'Nisha Example' });
    expect((await as(u.admin.id).post(`/imports/${job.id}/cancel`)).body.status).toBe('cancelled');
  });

  it('a hod imports only their own department’s rows', async () => {
    const res = await as(u.hod.id).upload(
      'faculty',
      'hod.csv',
      csv([
        'Employee code,Name,Short code,Designation,Department',
        'H1,Tara Example,TE,Lecturer,CSE',
        'H2,Omar Example,OE,Lecturer,ECE',
      ]),
    );
    expect(res.status).toBe(201);
    const problems = await rows((res.body as ImportJobDto).id, 'problems', u.hod.id);
    expect(problems.map((r) => [r.rowNumber, r.errors[0]?.message])).toEqual([
      [3, 'You can’t change ECE department’s data. Ask the ECE head or your institute admin.'],
    ]);
  });

  it('commits nothing when a row fails, and says which row', async () => {
    const job = await upload(
      'faculty',
      'rollback.csv',
      csv([
        'Employee code,Name,Short code,Designation,Department',
        'R1,Rollback One,RB1,Lecturer,CSE',
        'R2,Rollback Two,RB2,Lecturer,ME',
      ]),
    );
    expect(job.counts.problems).toBe(0);
    // Between preview and commit someone archives ME.
    await fx.owner.department.updateMany({
      where: { instituteId: a.institute.id, code: 'ME' },
      data: { deletedAt: new Date() },
    });
    const res = await commit(job.id);
    expect(res.status).toBe('preview');
    expect(res.summary.error).toBe(
      'Nothing was imported: row 3 could not be saved. There is no department with code ME. Add it first.',
    );
    expect(res.counts.problems).toBe(1);
    expect(
      await fx.owner.faculty.count({ where: { instituteId: a.institute.id, employeeCode: 'R1' } }),
    ).toBe(0);
    await fx.owner.department.updateMany({
      where: { instituteId: a.institute.id, code: 'ME' },
      data: { deletedAt: null },
    });
  });
});

describe('from programmes to teaching assignments, all through templates', () => {
  let termId: string;

  beforeAll(async () => {
    const session = await fx.owner.academicSession.create({
      data: { instituteId: a.institute.id, startYear: 2026, name: '2026-27' },
    });
    const term = await fx.owner.term.create({
      data: {
        instituteId: a.institute.id,
        sessionId: session.id,
        kind: 'odd',
        label: 'Jul–Dec 2026',
        startDate: new Date('2026-07-20T00:00:00Z'),
        endDate: new Date('2026-12-15T00:00:00Z'),
        status: 'active',
      },
    });
    termId = term.id;
  });

  it('programmes with branches, one row per branch', async () => {
    const job = await upload(
      'programmes',
      'programmes.csv',
      csv([
        'Programme code,Programme name,Level,Semesters,Lateral entry semester,Department,Branch code,Branch name,Branch department',
        'BTECH,B.Tech,UG,8,3,,CSE,Computer Science and Engineering,',
        'BTECH,B.Tech,UG,8,3,,ECE,Electronics and Communication,ECE',
        'MBA,MBA,PG,4,,AS,,,',
      ]),
    );
    expect(job.counts).toMatchObject({ problems: 0, create: 3 });
    expect((await commit(job.id)).summary).toMatchObject({ created: 3 });
    const btech = await fx.owner.programme.findFirstOrThrow({
      where: { instituteId: a.institute.id, code: 'BTECH' },
      include: { branches: { orderBy: { code: 'asc' } } },
    });
    expect(btech.branches.map((b) => b.code)).toEqual(['CSE', 'ECE']);
    const mba = await fx.owner.branch.findMany({
      where: { programme: { code: 'MBA', instituteId: a.institute.id } },
    });
    expect(mba.map((b) => b.isDefault)).toEqual([true]);
  });

  it('rooms, creating the building by name', async () => {
    const job = await upload(
      'rooms',
      'rooms.csv',
      csv([
        'Room code,Building,Floor,Type,Lab category,Rows,Seats per row,Accessible',
        'G16,Main Block,0,Lecture,,10,6,Yes',
        'SL1,Main Block,1,Lab,Software lab,,,No',
      ]),
    );
    expect(job.counts).toMatchObject({ problems: 0, create: 2 });
    await commit(job.id);
    const rooms = await fx.owner.room.findMany({
      where: { instituteId: a.institute.id },
      include: { building: true },
      orderBy: { code: 'asc' },
    });
    expect(rooms.map((r) => [r.code, r.type, r.building.name, r.isAccessible])).toEqual([
      ['G16', 'lecture', 'Main Block', true],
      ['SL1', 'lab', 'Main Block', false],
    ]);
  });

  it('courses, creating a draft scheme', async () => {
    const job = await upload(
      'courses',
      'scheme.csv',
      csv([
        'Programme,Scheme,Semester,Course code,Title,Short name,L,T,P,Offering department,Branches',
        'BTECH,Scheme 2024,3,CS301,Data Structures,DS,3,1,2,CSE,CSE',
        'BTECH,Scheme 2024,3,CS302,Discrete Mathematics,DM,3,1,0,CSE,CSE',
        'BTECH,Scheme 2024,9,CS901,Too Late,TL,3,0,0,CSE,',
      ]),
    );
    const problems = await rows(job.id, 'problems');
    expect(problems.map((r) => [r.rowNumber, r.errors[0]])).toEqual([
      [4, { column: 'semester', message: 'BTECH has 8 semesters.' }],
    ]);
    await as(u.admin.id).put(`/imports/${job.id}/rows/4`, { skip: true }).expect(200);
    expect((await commit(job.id)).summary).toMatchObject({ created: 2, skipped: 1 });
    const scheme = await fx.owner.schemeVersion.findFirstOrThrow({
      where: { instituteId: a.institute.id, name: 'Scheme 2024' },
      include: { courses: { orderBy: { code: 'asc' } } },
    });
    expect(scheme.status).toBe('draft');
    expect(scheme.courses.map((c) => c.code)).toEqual(['CS301', 'CS302']);
  });

  it('batches and sections for the term, with even sub-groups and the class created', async () => {
    const job = await upload(
      'batches_sections',
      'sections.csv',
      csv([
        'Programme,Branch,Admission year,Entry,Scheme,Section,Strength,Sub-groups,Home room',
        'BTECH,CSE,2025,Regular,Scheme 2024,A,61,2,G16',
        'BTECH,CSE,2025,Regular,Scheme 2024,B,60,3,',
        'BTECH,CSE,2010,Regular,Scheme 2024,A,60,2,',
      ]),
      termId,
    );
    const problems = await rows(job.id, 'problems');
    expect(problems.map((r) => [r.rowNumber, r.errors[0]?.message])).toEqual([
      [4, 'The 2010 batch of BTECH has no semester running in this term.'],
    ]);
    await as(u.admin.id).put(`/imports/${job.id}/rows/4`, { skip: true }).expect(200);
    expect((await commit(job.id)).summary).toMatchObject({ created: 2, skipped: 1 });
    const cohort = await fx.owner.cohort.findFirstOrThrow({
      where: { instituteId: a.institute.id, termId },
      include: {
        sections: {
          orderBy: { name: 'asc' },
          include: { subGroups: { orderBy: { name: 'asc' } } },
        },
      },
    });
    expect(cohort).toMatchObject({ semester: 3, displayCode: 'CSE S3' });
    expect(
      cohort.sections.map((s) => [
        s.name,
        s.displayName,
        s.strength,
        s.subGroups.map((g) => `${g.name}:${g.strength}`),
      ]),
    ).toEqual([
      ['A', 'CSE A', 61, ['A1:31', 'A2:30']],
      ['B', 'CSE B', 60, ['B1:20', 'B2:20', 'B3:20']],
    ]);
  });

  it('students, placed in sections and sub-groups of the term', async () => {
    const job = await upload(
      'students',
      'students.csv',
      csv([
        'Roll No,Name,Program,Branch,Batch,Section,Sub-group,Email',
        '2315001,Aarav Example,BTECH,CSE,2025,A,A1,aarav@example.edu',
        '2315002,Bina Example,BTECH,CSE,2025,B,B3,',
        '2315003,Chetan Example,BTECH,CSE,2025,C,,',
        '2315004,Divya Example,BTECH,ME,2025,,,',
      ]),
      termId,
    );
    const problems = await rows(job.id, 'problems');
    expect(problems.map((r) => [r.rowNumber, r.errors[0]?.message])).toEqual([
      [4, 'There is no section C for this batch in this term.'],
      [5, 'BTECH has no branch ME. It has CSE, ECE.'],
    ]);
    await as(u.admin.id)
      .put(`/imports/${job.id}/rows/4`, { data: { section: 'B' } })
      .expect(200);
    await as(u.admin.id).put(`/imports/${job.id}/rows/5`, { skip: true }).expect(200);
    expect((await commit(job.id)).summary).toMatchObject({ created: 3, skipped: 1 });
    const aarav = await fx.owner.student.findFirstOrThrow({
      where: { instituteId: a.institute.id, classRollNo: '2315001' },
      include: { section: true, subGroup: true },
    });
    expect([aarav.section?.name, aarav.subGroup?.name]).toEqual(['A', 'A1']);
  });

  it('teaching assignments by class, section and teacher code; re-import changes the teacher', async () => {
    const job = await upload(
      'teaching_assignments',
      'distribution.csv',
      csv([
        'Class,Section,Sub-group,Course code,L/T/P,Teacher,Co-teachers',
        'CSE S3,A,,CS301,L,AE,',
        'CSE S3,A,A1,CS301,P,AE,RE',
        'CSE S3,A,,CS302,P,AE,',
        'CSE S3,A,,CS301,T,ZZ,',
      ]),
      termId,
    );
    const problems = await rows(job.id, 'problems');
    expect(problems.map((r) => [r.rowNumber, r.errors.map((e) => e.message)])).toEqual([
      [4, ['CS302 has no practical periods (P = 0).']],
      [5, ['There is no teacher with code ZZ. Import faculty first.']],
    ]);
    await as(u.admin.id)
      .put(`/imports/${job.id}/rows/4`, { data: { component: 'T' } })
      .expect(200);
    await as(u.admin.id)
      .put(`/imports/${job.id}/rows/5`, { data: { teacher: 'E2' } })
      .expect(200);
    expect((await commit(job.id)).summary).toMatchObject({ created: 4 });
    const lab = await fx.owner.teachingAssignment.findFirstOrThrow({
      where: { instituteId: a.institute.id, component: 'practical' },
      include: { faculty: { include: { faculty: true } }, subGroup: true },
    });
    expect(lab.target).toBe('subgroup');
    expect(lab.subGroup?.name).toBe('A1');
    expect(lab.faculty.map((f) => [f.faculty.shortCode, f.role]).sort()).toEqual([
      ['AE', 'main'],
      ['RE', 'co_teacher'],
    ]);

    const again = await upload(
      'teaching_assignments',
      'distribution.csv',
      csv([
        'Class,Section,Course code,L/T/P,Teacher',
        'CSE S3,A,CS301,L,KE',
        'CSE S3,A,CS302,T,AE',
      ]),
      termId,
    );
    expect(again.counts).toMatchObject({ problems: 0, update: 1, unchanged: 1 });
    await commit(again.id);
    const lecture = await fx.owner.teachingAssignment.findFirstOrThrow({
      where: { instituteId: a.institute.id, component: 'lecture' },
      include: { faculty: { include: { faculty: true } } },
    });
    expect(lecture.faculty.map((f) => f.faculty.shortCode)).toEqual(['KE']);
    expect(
      await fx.owner.teachingAssignment.count({ where: { instituteId: a.institute.id } }),
    ).toBe(4);
  });
});

describe('holidays', () => {
  it('reads Indian date formats and ranges; a department holiday is scoped', async () => {
    const job = await upload(
      'holidays',
      'holidays.xlsx',
      await xlsx([
        ['Date', 'Until', 'Holiday', 'Only for department'],
        ['20-10-2026', '', 'Dussehra', ''],
        [new Date(Date.UTC(2026, 10, 8)), '10/11/2026', 'Diwali break', ''],
        ['31-02-2026', '', 'Not a day', ''],
        ['2026-11-24', '', 'CSE foundation day', 'CSE'],
      ]),
    );
    const problems = await rows(job.id, 'problems');
    expect(problems.map((r) => [r.rowNumber, r.errors[0]])).toEqual([
      [4, { column: 'startDate', message: 'Enter a date like 20-10-2026, not “31-02-2026”.' }],
    ]);
    await as(u.admin.id).put(`/imports/${job.id}/rows/4`, { skip: true }).expect(200);
    await commit(job.id);
    const holidays = await fx.owner.holiday.findMany({
      where: { instituteId: a.institute.id },
      orderBy: { startDate: 'asc' },
    });
    expect(
      holidays.map((h) => [
        h.name,
        h.startDate.toISOString().slice(0, 10),
        h.endDate.toISOString().slice(0, 10),
        h.scopeType,
      ]),
    ).toEqual([
      ['Dussehra', '2026-10-20', '2026-10-20', 'institute'],
      ['Diwali break', '2026-11-08', '2026-11-10', 'institute'],
      ['CSE foundation day', '2026-11-24', '2026-11-24', 'department'],
    ]);
  });

  it('reads and commits files over 1,000 rows in the background', async ({ skip }) => {
    skip(!hasRedis, NO_REDIS);
    const lines = ['Date,Holiday'];
    for (let i = 0; i < 1001; i++) {
      const d = new Date(Date.UTC(2030, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
      lines.push(`${d},Bulk day ${i + 1}`);
    }
    const created = await upload('holidays', 'bulk.csv', csv(lines));
    expect(created.status).toBe('parsing');
    const waitFor = async (status: string) => {
      for (let i = 0; i < 240; i++) {
        const job = (await as(u.admin.id).get(`/imports/${created.id}`)).body as ImportJobDto;
        if (job.status === status) return job;
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error(`import never reached ${status}`);
    };
    const preview = await waitFor('preview');
    expect(preview.counts).toMatchObject({ create: 1001, problems: 0 });
    expect((await as(u.admin.id).post(`/imports/${created.id}/commit`)).body.status).toBe(
      'committing',
    );
    const done = await waitFor('committed');
    expect(done.summary).toMatchObject({ created: 1001 });
    expect(
      await fx.owner.holiday.count({
        where: { instituteId: a.institute.id, name: { startsWith: 'Bulk day' } },
      }),
    ).toBe(1001);
  }, 180_000);
});

describe('import list', () => {
  it('lists recent imports with who uploaded them', async () => {
    const res = await as(u.admin.id).get('/imports');
    expect(res.status).toBe(200);
    const list = res.body as ImportJobDto[];
    expect(list.length).toBeGreaterThan(5);
    expect(list[0]!.createdByName).toBeTruthy();
  });
});
