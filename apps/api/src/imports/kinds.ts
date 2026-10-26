/**
 * What one import row means for each kind (ADR 0011). `plan()` turns a row's text into the
 * entity's input, finds the existing row by natural key, and lists problems in plain words.
 * The same plan is used for the preview and, inside the commit transaction, to write: so
 * the preview never promises something the commit does differently. Writes go through
 * MasterDataService (can(), reference checks, audit), except cohorts and teaching
 * assignments, which have no generic write path yet and are audited here.
 *
 * Lookups are loaded once per check or commit; a commit adds what it creates (a new
 * building, batch or programme), so later rows of the same file can use it.
 */
import type { TxClient } from '@slotwise/db';
import {
  blank,
  can,
  COMPONENT_LETTER,
  defaultCohortCode,
  defaultLoad,
  parseChoice,
  parseDate,
  parseDecimal,
  parseList,
  parseWhole,
  parseYesNo,
  semesterFor,
  splitEvenly,
  subGroupNames,
  type Action,
  type CellProblem,
  type Component,
  type ImportKindName,
  type ImportRowAction,
  type ResourceType,
} from '@slotwise/shared';
import type { z } from 'zod';
import {
  branches,
  courseInclude,
  courses,
  departments,
  programmeInclude,
  programmes,
  schemeVersions,
} from '../academics/academics.entities';
import { holidays } from '../calendar/calendar.entities';
import {
  batches,
  batchInclude,
  sectionInclude,
  sections,
  students,
} from '../cohorts/cohorts.entities';
import { faculty, facultyInclude } from '../faculty/faculty.entities';
import { buildings, roomInclude, rooms } from '../infrastructure/infrastructure.entities';
import type { BaseRow, EntityContext, EntityDef } from '../masterdata/entity';
import type { MasterDataService } from '../masterdata/masterdata.service';

export type RowData = Record<string, string>;
export type WriteResult = 'created' | 'updated' | 'unchanged';

export interface KindContext extends EntityContext {
  md: MasterDataService;
  termId: string | null;
}

export interface Plan {
  problems: CellProblem[];
  action: Exclude<ImportRowAction, 'skip'>;
  /** Writes the row; only called when there are no problems. */
  write(): Promise<WriteResult>;
}

export interface KindHandler<L = unknown> {
  load(ctx: KindContext): Promise<L>;
  plan(row: RowData, lk: L, ctx: KindContext): Plan;
}

const live = { deletedAt: null };
/** Stands in for the id of something this row creates, so its other values can be checked. */
const NEW_ID = '00000000-0000-4000-8000-000000000000';

// ---- Reading cells -------------------------------------------------------------------------

/** Reads a row's cells by column key and collects problems in plain words. */
class Cells {
  readonly problems: CellProblem[] = [];
  constructor(private readonly data: RowData) {}

  has(col: string): boolean {
    return !blank(this.data[col]);
  }

  text(col: string): string | null {
    return this.has(col) ? this.data[col]!.trim() : null;
  }

  /** Codes are stored in capitals. */
  code(col: string): string | null {
    return this.text(col)?.toUpperCase() ?? null;
  }

  require(col: string, message: string): string {
    const v = this.text(col);
    if (v == null) this.problem(col, message);
    return v ?? '';
  }

  whole(col: string): number | null {
    const v = parseWhole(this.data[col]);
    if (v === undefined) this.problem(col, `Enter a whole number, not “${this.data[col]}”.`);
    return v ?? null;
  }

  decimal(col: string): number | null {
    const v = parseDecimal(this.data[col]);
    if (v === undefined) this.problem(col, `Enter a number, not “${this.data[col]}”.`);
    return v ?? null;
  }

  yesNo(col: string): boolean | null {
    const v = parseYesNo(this.data[col]);
    if (v === undefined) this.problem(col, `Enter Yes or No, not “${this.data[col]}”.`);
    return v ?? null;
  }

  date(col: string): string | null {
    const v = parseDate(this.data[col]);
    if (v === undefined)
      this.problem(col, `Enter a date like 20-10-2026, not “${this.data[col]}”.`);
    return v ?? null;
  }

  list(col: string): string[] {
    return parseList(this.data[col]);
  }

  choice<T extends string>(col: string, options: Readonly<Record<T, readonly string[]>>): T | null {
    const v = parseChoice(this.data[col], options);
    if (v === undefined) {
      const names = Object.values<readonly string[]>(options).map((n) => n[0]);
      this.problem(col, `“${this.data[col]}” is not one of: ${names.join(', ')}.`);
    }
    return v ?? null;
  }

  problem(column: string | null, message: string): void {
    this.problems.push({ column, message });
  }
}

const DEPARTMENT_KIND = { teaching: ['Teaching'], service: ['Service', 'Non-teaching'] } as const;
const LEVEL = {
  ug: ['UG', 'Undergraduate', 'Graduate'],
  pg: ['PG', 'Postgraduate', 'Post Graduate'],
  diploma: ['Diploma'],
  doctoral: ['Doctoral', 'PhD', 'Ph.D'],
} as const;
const ENTRY = {
  regular: ['Regular', 'R'],
  lateral: ['LEET', 'Lateral', 'Lateral entry', 'LE'],
} as const;
const DESIGNATION = {
  professor: ['Professor', 'Prof'],
  associate_professor: ['Associate Professor', 'Assoc Prof', 'Associate Prof'],
  assistant_professor: ['Assistant Professor', 'Asst Prof', 'Assistant Prof', 'AP'],
  lecturer: ['Lecturer'],
  teaching_assistant: ['Teaching Assistant', 'TA'],
  visiting: ['Visiting', 'Visiting Faculty', 'Guest', 'Guest Faculty'],
} as const;
const EXPERIENCE = {
  experienced: ['Experienced', 'Regular', 'Senior'],
  fresher: ['Fresher', 'New', 'Junior'],
} as const;
const ROOM_TYPE = {
  lecture: ['Lecture', 'Lecture hall', 'Classroom', 'Class room', 'Theory'],
  tutorial: ['Tutorial', 'Tutorial room'],
  lab: ['Lab', 'Laboratory', 'Practical'],
  seminar: ['Seminar', 'Seminar hall'],
  drawing_hall: ['Drawing hall', 'Drawing'],
  workshop: ['Workshop'],
} as const;
const COURSE_TYPE = {
  core: ['Core', 'Compulsory'],
  programme_elective: ['Programme elective', 'Program elective', 'Department elective', 'PE'],
  open_elective: ['Open elective', 'OE'],
  mandatory: ['Mandatory', 'Non-credit'],
  audit: ['Audit'],
  lab: ['Lab', 'Practical'],
  project: ['Project'],
  seminar: ['Seminar'],
  training: ['Training', 'Internship'],
  mooc: ['MOOC', 'NPTEL', 'Swayam'],
} as const;
const COMPONENT = {
  lecture: ['L', 'Lecture', 'Theory'],
  tutorial: ['T', 'Tutorial'],
  practical: ['P', 'Practical', 'Lab'],
} as const;

// ---- Shared lookups ------------------------------------------------------------------------

interface DepartmentLk {
  id: string;
  code: string;
  row: Parameters<typeof departments.toInput>[0];
}
interface BranchLk {
  id: string;
  code: string;
  name: string;
  departmentId: string;
  isDefault: boolean;
}
interface ProgrammeLk {
  id: string;
  code: string;
  name: string;
  level: string;
  totalSemesters: number;
  lateralEntrySemester: number | null;
  departmentId: string | null;
  input: z.infer<typeof programmes.schema> | null;
  branches: Map<string, BranchLk>;
  /** Scheme name (lower case) → id. */
  schemes: Map<string, string>;
}
interface Org {
  departments: Map<string, DepartmentLk>;
  departmentCode: Map<string, string>;
  programmes: Map<string, ProgrammeLk>;
}

async function loadOrg(tx: TxClient): Promise<Org> {
  const deptRows = await tx.department.findMany({ where: live });
  const progRows = await tx.programme.findMany({ where: live, include: programmeInclude });
  const schemeRows = await tx.schemeVersion.findMany({
    where: live,
    select: { id: true, name: true, programmeId: true },
  });
  const org: Org = {
    departments: new Map(
      deptRows.map((d) => [d.code.toUpperCase(), { id: d.id, code: d.code, row: d }]),
    ),
    departmentCode: new Map(deptRows.map((d) => [d.id, d.code])),
    programmes: new Map(),
  };
  for (const p of progRows) {
    org.programmes.set(p.code.toUpperCase(), {
      id: p.id,
      code: p.code,
      name: p.name,
      level: p.level,
      totalSemesters: p.totalSemesters,
      lateralEntrySemester: p.lateralEntrySemester,
      departmentId: p.departmentId,
      input: programmes.toInput(p),
      branches: new Map(
        p.branches.map((b) => [
          b.code.toUpperCase(),
          {
            id: b.id,
            code: b.code,
            name: b.name,
            departmentId: b.departmentId,
            isDefault: b.isDefault,
          },
        ]),
      ),
      schemes: new Map(
        schemeRows.filter((s) => s.programmeId === p.id).map((s) => [s.name.toLowerCase(), s.id]),
      ),
    });
  }
  return org;
}

function department(cells: Cells, org: Org, col: string, required: boolean): string | null {
  const code = cells.code(col);
  if (code == null) {
    if (required) cells.problem(col, 'Enter the department code, e.g. CSE.');
    return null;
  }
  const d = org.departments.get(code);
  if (!d) cells.problem(col, `There is no department with code ${code}. Add it first.`);
  return d?.id ?? null;
}

function programme(cells: Cells, org: Org, col = 'programme'): ProgrammeLk | null {
  const code = cells.code(col);
  if (code == null) {
    cells.problem(col, 'Enter the programme code, e.g. BTECH.');
    return null;
  }
  const p = org.programmes.get(code);
  if (!p) cells.problem(col, `There is no programme with code ${code}. Add it first.`);
  return p ?? null;
}

/** Blank branch = the programme's only (default) branch. */
function branch(cells: Cells, p: ProgrammeLk | null, col = 'branch'): BranchLk | null {
  if (!p) return null;
  const code = cells.code(col);
  if (code == null) {
    const all = [...p.branches.values()];
    if (all.length === 1) return all[0]!;
    cells.problem(
      col,
      `Enter the branch: ${p.code} has ${all.map((b) => b.code).join(', ') || 'no branches yet'}.`,
    );
    return null;
  }
  const b = p.branches.get(code);
  if (!b) {
    const known = [...p.branches.keys()].join(', ');
    cells.problem(col, `${p.code} has no branch ${code}.${known ? ` It has ${known}.` : ''}`);
  }
  return b ?? null;
}

// ---- Turning a value into a plan -----------------------------------------------------------

/** Same value regardless of key order. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}

function issues(
  error: z.ZodError,
  columns: Readonly<Record<string, string | null>>,
): CellProblem[] {
  return error.issues.map((i) => {
    const field = String(i.path[0] ?? '');
    return { column: field in columns ? columns[field]! : null, message: i.message };
  });
}

function allowed(
  ctx: KindContext,
  action: Action,
  type: ResourceType,
  departmentId: string | null,
  extra: { facultyDepartmentIds?: readonly string[] } = {},
): boolean {
  return can(ctx.tenant.authUser, action, ctx.md.resource(ctx.tenant, type, departmentId, extra));
}

function notAllowed(org: Org, departmentId: string | null): CellProblem {
  const code = departmentId ? org.departmentCode.get(departmentId) : null;
  return {
    column: null,
    message: code
      ? `You can’t change ${code} department’s data. Ask the ${code} head or your institute admin.`
      : 'Only your institute admin can change this row.',
  };
}

interface EntityStep<I, D> {
  problems: CellProblem[];
  action: 'create' | 'update' | 'unchanged';
  input: I | null;
  write(): Promise<{ result: WriteResult; dto: D | null }>;
}

/**
 * Validates `raw` with the entity's schema, compares it with the existing row and checks
 * can() for the owning department(s). `write` creates or updates through MasterDataService.
 */
function entityStep<I, R extends BaseRow, D>(
  ctx: KindContext,
  org: Org,
  def: EntityDef<I, R, D>,
  raw: object,
  existing: { id: string; input: I } | null,
  owner: { dept: string | null; oldDept?: string | null },
  columns: Readonly<Record<string, string | null>>,
): EntityStep<I, D> {
  const parsed = def.schema.safeParse(raw);
  const problems = parsed.success ? [] : issues(parsed.error, columns);
  const input = parsed.success ? parsed.data : null;
  const action = !existing
    ? 'create'
    : input && stable(input) === stable(existing.input)
      ? 'unchanged'
      : 'update';
  if (action !== 'unchanged') {
    for (const dept of new Set([owner.dept, ...(existing ? [owner.oldDept ?? owner.dept] : [])])) {
      if (!allowed(ctx, def.manage, def.resourceType, dept)) {
        problems.push(notAllowed(org, dept));
        break;
      }
    }
  }
  return {
    problems,
    action,
    input,
    async write() {
      if (!input) throw new Error('write() called for a row with problems');
      if (action === 'unchanged') return { result: 'unchanged', dto: null };
      if (existing)
        return { result: 'updated', dto: await ctx.md.updateIn(ctx, def, existing.id, input) };
      return { result: 'created', dto: await ctx.md.createIn(ctx, def, input) };
    },
  };
}

/** One plan from several steps, in order (e.g. programme then branch). */
function combine(
  cells: Cells,
  steps: { problems: CellProblem[]; action: WriteResult | 'create' | 'update' }[],
  write: () => Promise<WriteResult>,
): Plan {
  // A cell's own message ("There is no department XYZ") beats the schema's generic one.
  const own = new Set(cells.problems.map((p) => p.column));
  const problems = [
    ...cells.problems,
    ...steps.flatMap((s) => s.problems).filter((p) => p.column == null || !own.has(p.column)),
  ];
  const actions = steps.map((s) => s.action);
  return {
    problems,
    action: actions.includes('create')
      ? 'create'
      : actions.includes('update')
        ? 'update'
        : 'unchanged',
    write,
  };
}

const best = (results: WriteResult[]): WriteResult =>
  results.includes('created') ? 'created' : results.includes('updated') ? 'updated' : 'unchanged';

// ---- Departments ---------------------------------------------------------------------------

const departmentsKind: KindHandler<Org> = {
  load: ({ tx }) => loadOrg(tx),
  plan(row, org, ctx) {
    const c = new Cells(row);
    const code = c.code('code') ?? '';
    const found = org.departments.get(code);
    const before = found ? departments.toInput(found.row) : null;
    const step = entityStep(
      ctx,
      org,
      departments,
      {
        code,
        name: c.text('name') ?? before?.name,
        kind: c.choice('kind', DEPARTMENT_KIND) ?? before?.kind ?? 'teaching',
      },
      found && before ? { id: found.id, input: before } : null,
      { dept: found?.id ?? null },
      { code: 'code', name: 'name', kind: 'kind' },
    );
    return combine(c, [step], async () => {
      const { result, dto } = await step.write();
      if (dto && !found) {
        const row = await ctx.tx.department.findFirstOrThrow({ where: { id: dto.id } });
        org.departments.set(code, { id: row.id, code: row.code, row });
        org.departmentCode.set(row.id, row.code);
      }
      return result;
    });
  },
};

// ---- Programmes and branches ---------------------------------------------------------------

const programmesKind: KindHandler<Org> = {
  load: ({ tx }) => loadOrg(tx),
  plan(row, org, ctx) {
    const c = new Cells(row);
    const code = c.code('code') ?? '';
    const found = org.programmes.get(code);
    const before = found?.input ?? null;
    const branchCode = c.code('branchCode');
    const departmentId = department(c, org, 'department', false) ?? before?.departmentId ?? null;
    const programmeStep = entityStep(
      ctx,
      org,
      programmes,
      {
        code,
        name: c.text('name') ?? before?.name,
        level: c.choice('level', LEVEL) ?? before?.level,
        mode: before?.mode ?? 'full_time',
        totalSemesters: c.whole('totalSemesters') ?? before?.totalSemesters,
        lateralEntrySemester: c.has('lateralEntrySemester')
          ? c.whole('lateralEntrySemester')
          : (before?.lateralEntrySemester ?? null),
        departmentId,
        hasBranches: before?.hasBranches ?? branchCode != null,
      },
      found && before ? { id: found.id, input: before } : null,
      { dept: departmentId, oldDept: before?.departmentId ?? null },
      {
        code: 'code',
        name: 'name',
        level: 'level',
        totalSemesters: 'totalSemesters',
        lateralEntrySemester: 'lateralEntrySemester',
        departmentId: 'department',
      },
    );
    if (!branchCode) {
      if (
        found &&
        found.branches.size > 0 &&
        ![...found.branches.values()].some((b) => b.isDefault)
      ) {
        c.problem('branchCode', `Enter the branch code: ${code} has branches.`);
      }
      return combine(c, [programmeStep], async () => {
        const { result, dto } = await programmeStep.write();
        if (dto && !found) org.programmes.set(code, await reloadProgramme(ctx.tx, dto.id));
        return result;
      });
    }

    if (before && !before.hasBranches) {
      c.problem('branchCode', `${code} has no branches. Leave Branch code blank.`);
    }
    const existingBranch = found?.branches.get(branchCode) ?? null;
    const branchDeptCode = c.code('branchDepartment') ?? branchCode;
    const branchDept = org.departments.get(branchDeptCode);
    if (!branchDept && !existingBranch) {
      c.problem(
        c.has('branchDepartment') ? 'branchDepartment' : 'branchCode',
        `There is no department with code ${branchDeptCode}. Fill Branch department with an existing department code.`,
      );
    }
    const branchRaw = (programmeId: string) => ({
      programmeId,
      code: branchCode,
      name: c.text('branchName') ?? existingBranch?.name ?? branchCode,
      departmentId: branchDept?.id ?? existingBranch?.departmentId,
    });
    const branchColumns = {
      code: 'branchCode',
      name: 'branchName',
      departmentId: 'branchDepartment',
    };
    const branchBefore = (programmeId: string) =>
      existingBranch
        ? {
            id: existingBranch.id,
            input: {
              programmeId,
              code: existingBranch.code,
              name: existingBranch.name,
              departmentId: existingBranch.departmentId,
            },
          }
        : null;
    // The branch is owned by the programme's department (ADR 0008).
    const branchStep = entityStep(
      ctx,
      org,
      branches,
      branchRaw(found?.id ?? NEW_ID),
      branchBefore(found?.id ?? NEW_ID),
      { dept: before?.departmentId ?? departmentId },
      branchColumns,
    );
    return combine(c, [programmeStep, branchStep], async () => {
      const first = await programmeStep.write();
      let p = found ?? null;
      if (first.dto && !found) {
        p = await reloadProgramme(ctx.tx, first.dto.id);
        org.programmes.set(code, p);
      }
      const second = entityStep(
        ctx,
        org,
        branches,
        branchRaw(p!.id),
        branchBefore(p!.id),
        { dept: p!.departmentId },
        branchColumns,
      );
      const { result, dto } = await second.write();
      if (dto) {
        p!.branches.set(branchCode, {
          id: dto.id,
          code: dto.code,
          name: dto.name,
          departmentId: dto.departmentId,
          isDefault: dto.isDefault,
        });
      }
      return best([first.result, result]);
    });
  },
};

async function reloadProgramme(tx: TxClient, id: string): Promise<ProgrammeLk> {
  const p = await tx.programme.findFirstOrThrow({ where: { id }, include: programmeInclude });
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    level: p.level,
    totalSemesters: p.totalSemesters,
    lateralEntrySemester: p.lateralEntrySemester,
    departmentId: p.departmentId,
    input: programmes.toInput(p),
    branches: new Map(
      p.branches.map((b) => [
        b.code.toUpperCase(),
        {
          id: b.id,
          code: b.code,
          name: b.name,
          departmentId: b.departmentId,
          isDefault: b.isDefault,
        },
      ]),
    ),
    schemes: new Map(),
  };
}

// ---- Batches and sections ------------------------------------------------------------------

interface TermLk {
  id: string;
  kind: 'odd' | 'even';
  startYear: number;
}
interface BatchLk {
  id: string;
  input: z.infer<typeof batches.schema>;
}
interface CohortLk {
  id: string;
  batchId: string;
  semester: number;
  displayCode: string;
  joinsCohortId: string | null;
  departmentId: string;
  schemeVersionId: string;
}
interface SectionLk {
  id: string;
  cohortId: string;
  input: z.infer<typeof sections.schema>;
  subGroups: Map<string, string>;
}
interface Groups {
  org: Org;
  term: TermLk | null;
  /** branchId|year|entry → batch */
  batches: Map<string, BatchLk>;
  /** batchId → cohort in the job's term */
  cohorts: Map<string, CohortLk>;
  /** cohortId|SECTION → section */
  sections: Map<string, SectionLk>;
  /** Room code → id */
  rooms: Map<string, string>;
}

const batchKey = (branchId: string, year: number, entry: string) => `${branchId}|${year}|${entry}`;
const sectionKey = (cohortId: string, name: string) => `${cohortId}|${name.toUpperCase()}`;

async function loadGroups(ctx: KindContext): Promise<Groups> {
  const { tx, termId } = ctx;
  const org = await loadOrg(tx);
  const term = termId
    ? await tx.term.findFirst({ where: { id: termId, ...live }, include: { session: true } })
    : null;
  const batchRows = await tx.batch.findMany({ where: live, include: batchInclude });
  const cohortRows = term
    ? await tx.cohort.findMany({
        where: { termId: term.id, ...live },
        include: { batch: { include: { branch: true } } },
      })
    : [];
  const sectionRows = term
    ? await tx.section.findMany({
        where: { cohort: { termId: term.id }, ...live },
        include: sectionInclude,
      })
    : [];
  const roomRows = await tx.room.findMany({ where: live, select: { id: true, code: true } });
  return {
    org,
    term: term ? { id: term.id, kind: term.kind, startYear: term.session.startYear } : null,
    batches: new Map(
      batchRows.map((b) => [
        batchKey(b.branchId, b.admissionYear, b.entryType),
        { id: b.id, input: batches.toInput(b) },
      ]),
    ),
    cohorts: new Map(cohortRows.map((c) => [c.batchId, cohortLk(c)])),
    sections: new Map(sectionRows.map((s) => [sectionKey(s.cohortId, s.name), sectionLk(s)])),
    rooms: new Map(roomRows.map((r) => [r.code.toUpperCase(), r.id])),
  };
}

function cohortLk(c: {
  id: string;
  batchId: string;
  semester: number;
  displayCode: string;
  joinsCohortId: string | null;
  batch: { schemeVersionId: string; branch: { departmentId: string } };
}): CohortLk {
  return {
    id: c.id,
    batchId: c.batchId,
    semester: c.semester,
    displayCode: c.displayCode,
    joinsCohortId: c.joinsCohortId,
    departmentId: c.batch.branch.departmentId,
    schemeVersionId: c.batch.schemeVersionId,
  };
}

function sectionLk(s: Parameters<typeof sections.toInput>[0]): SectionLk {
  return {
    id: s.id,
    cohortId: s.cohortId,
    input: sections.toInput(s),
    subGroups: new Map(s.subGroups.map((g) => [g.name.toUpperCase(), g.id])),
  };
}

/** The batch a row names (programme, branch, admission year, entry). */
function batchOf(c: Cells, lk: Groups) {
  const p = programme(c, lk.org);
  const b = branch(c, p);
  const year = c.whole('admissionYear');
  if (year == null && !c.has('admissionYear'))
    c.problem('admissionYear', 'Enter the admission year, e.g. 2025.');
  const entry = c.choice('entry', ENTRY) ?? 'regular';
  const found = b && year != null ? (lk.batches.get(batchKey(b.id, year, entry)) ?? null) : null;
  return { p, b, year, entry, found };
}

const batchesSectionsKind: KindHandler<Groups> = {
  load: loadGroups,
  plan(row, lk, ctx) {
    const c = new Cells(row);
    const term = lk.term;
    if (!term) c.problem(null, 'Choose the term these sections are for.');
    const { p, b, year, entry, found } = batchOf(c, lk);
    const dept = b?.departmentId ?? null;

    // Batch: created when new; its scheme updated when given.
    const schemeName = c.text('scheme');
    let schemeId = found?.input.schemeVersionId ?? null;
    if (schemeName && p) {
      schemeId = p.schemes.get(schemeName.toLowerCase()) ?? null;
      if (!schemeId)
        c.problem(
          'scheme',
          `${p.code} has no scheme called “${schemeName}”. Add it on the Schemes page.`,
        );
    } else if (!found && p) {
      c.problem('scheme', 'Enter the scheme this new batch follows, e.g. Scheme 2024.');
    }
    const batchRaw = (): object => ({
      programmeId: p?.id,
      branchId: b?.id,
      admissionYear: year,
      entryType: entry,
      schemeVersionId: schemeId ?? found?.input.schemeVersionId,
      status: found?.input.status ?? 'active',
    });
    const batchCols = {
      programmeId: 'programme',
      branchId: 'branch',
      admissionYear: 'admissionYear',
      entryType: 'entry',
      schemeVersionId: 'scheme',
    };
    const batchStep = entityStep(ctx, lk.org, batches, batchRaw(), found, { dept }, batchCols);

    // Cohort of this batch in the term: created when missing, like "Generate cohorts".
    const cohort = found ? (lk.cohorts.get(found.id) ?? null) : null;
    let semester = cohort?.semester ?? null;
    if (!cohort && term && p && year != null) {
      semester = semesterFor({ admissionYear: year, entryType: entry }, p, {
        sessionStartYear: term.startYear,
        kind: term.kind,
      });
      if (semester == null) {
        c.problem(
          'admissionYear',
          `The ${year} batch of ${p.code} has no semester running in this term.`,
        );
      }
    }
    if (
      cohort?.joinsCohortId ||
      (!cohort && entry === 'lateral' && b && semester != null && regularHost(lk, b.id, semester))
    ) {
      c.problem(
        'entry',
        'Lateral-entry students sit in the regular sections here. Add them to that section’s strength.',
      );
    }
    if (!cohort && !allowed(ctx, 'cohort.manage', 'cohort', dept))
      c.problems.push(notAllowed(lk.org, dept));

    // Section with even sub-groups.
    const name = c.require('section', 'Enter the section name, e.g. A.').toUpperCase();
    const existing = cohort ? (lk.sections.get(sectionKey(cohort.id, name)) ?? null) : null;
    const before = existing?.input ?? null;
    const strength = c.whole('strength') ?? before?.strength ?? null;
    const groupCount = c.has('subGroups') ? c.whole('subGroups') : (before?.subGroups.length ?? 2);
    if (groupCount != null && (groupCount < 0 || groupCount > 6)) {
      c.problem('subGroups', 'Sub-groups must be between 0 and 6.');
    }
    const keepGroups =
      before &&
      !c.has('subGroups') &&
      before.subGroups.reduce((a, g) => a + g.strength, 0) === strength;
    const subGroups = keepGroups
      ? before.subGroups
      : strength != null && groupCount != null && groupCount >= 0 && groupCount <= 6
        ? subGroupNames(name, groupCount).map((n, i) => ({
            name: n,
            strength: splitEvenly(strength, groupCount)[i]!,
          }))
        : [];
    const homeRoomCode = c.code('homeRoom');
    const homeRoomId = homeRoomCode
      ? (lk.rooms.get(homeRoomCode) ?? null)
      : (before?.homeRoomId ?? null);
    if (homeRoomCode && !homeRoomId)
      c.problem('homeRoom', `There is no room ${homeRoomCode}. Import rooms first.`);
    const label = b ? (b.isDefault ? p!.code : b.code) : '';
    const sectionRaw = (cohortId: string): object => ({
      cohortId,
      name,
      displayName: c.text('displayName') ?? before?.displayName ?? `${label} ${name}`.trim(),
      strength,
      homeRoomId,
      subGroups,
    });
    const sectionCols = {
      name: 'section',
      displayName: 'displayName',
      strength: 'strength',
      homeRoomId: 'homeRoom',
      subGroups: 'subGroups',
    };
    const sectionStep = entityStep(
      ctx,
      lk.org,
      sections,
      sectionRaw(cohort?.id ?? NEW_ID),
      existing ? { id: existing.id, input: existing.input } : null,
      { dept },
      sectionCols,
    );

    return combine(c, [batchStep, sectionStep], async () => {
      const batchWrite = await batchStep.write();
      let batch = found;
      if (batchWrite.dto) {
        batch = {
          id: batchWrite.dto.id,
          input: batches.toInput(
            await ctx.tx.batch.findFirstOrThrow({
              where: { id: batchWrite.dto.id },
              include: batchInclude,
            }),
          ),
        };
        lk.batches.set(batchKey(b!.id, year!, entry), batch);
      }
      let co = lk.cohorts.get(batch!.id) ?? null;
      if (!co) {
        co = await createCohort(ctx, lk, batch!.id, p!, b!, semester!, entry);
        lk.cohorts.set(batch!.id, co);
      }
      const step = entityStep(
        ctx,
        lk.org,
        sections,
        sectionRaw(co.id),
        existing ? { id: existing.id, input: existing.input } : null,
        { dept },
        sectionCols,
      );
      const { result, dto } = await step.write();
      if (dto) {
        const s = await ctx.tx.section.findFirstOrThrow({
          where: { id: dto.id },
          include: sectionInclude,
        });
        lk.sections.set(sectionKey(co.id, name), sectionLk(s));
      }
      return best([batchWrite.result, result]);
    });
  },
};

function regularHost(lk: Groups, branchId: string, semester: number): CohortLk | null {
  for (const [key, batch] of lk.batches) {
    if (!key.startsWith(`${branchId}|`) || batch.input.entryType !== 'regular') continue;
    const co = lk.cohorts.get(batch.id);
    if (co && co.semester === semester && !co.joinsCohortId) return co;
  }
  return null;
}

async function createCohort(
  ctx: KindContext,
  lk: Groups,
  batchId: string,
  p: ProgrammeLk,
  b: BranchLk,
  semester: number,
  entryType: 'regular' | 'lateral',
): Promise<CohortLk> {
  ctx.md.assertCan(
    ctx.tenant,
    'cohort.manage',
    ctx.md.resource(ctx.tenant, 'cohort', b.departmentId),
  );
  const created = await ctx.tx.cohort.create({
    data: {
      instituteId: ctx.tenant.institute.id,
      batchId,
      termId: lk.term!.id,
      semester,
      displayCode: defaultCohortCode({
        programmeCode: p.code,
        programmeLevel: p.level as 'ug' | 'pg' | 'diploma' | 'doctoral',
        branchCode: b.code,
        isDefaultBranch: b.isDefault,
        semester,
        entryType,
      }),
    },
    include: { batch: { include: { branch: true } } },
  });
  await ctx.md.audit(ctx, 'cohort.created', 'cohort', created.id, {
    batchId,
    semester,
    via: 'import',
  });
  return cohortLk(created);
}

// ---- Students ------------------------------------------------------------------------------

interface StudentsLk extends Groups {
  /** CLASS ROLL NO → student */
  students: Map<string, { id: string; input: z.infer<typeof students.schema> }>;
}

const studentsKind: KindHandler<StudentsLk> = {
  async load(ctx) {
    const groups = await loadGroups(ctx);
    const rows = await ctx.tx.student.findMany({ where: live });
    return {
      ...groups,
      students: new Map(
        rows.map((s) => [s.classRollNo.toUpperCase(), { id: s.id, input: students.toInput(s) }]),
      ),
    };
  },
  plan(row, lk, ctx) {
    const c = new Cells(row);
    const rollNo = c.require('classRollNo', 'Enter the class roll number.');
    const found = lk.students.get(rollNo.toUpperCase()) ?? null;
    const before = found?.input ?? null;
    const { p, b, year, found: batch } = batchOf(c, lk);
    if (p && b && year != null && !batch) {
      c.problem(
        'admissionYear',
        `There is no ${p.code}${b.isDefault ? '' : ` ${b.code}`} ${year} batch. Import batches and sections first.`,
      );
    }
    let sectionId = before && batch?.id === before.batchId ? before.sectionId : null;
    let subGroupId = before && batch?.id === before.batchId ? before.subGroupId : null;
    if (c.has('section') || c.has('subGroup')) {
      const cohort = batch ? lk.cohorts.get(batch.id) : null;
      if (!lk.term) c.problem('section', 'Choose a term to place students in sections.');
      else if (batch && !cohort)
        c.problem('section', 'This batch has no class in the chosen term yet.');
      const sectionName = c.code('section');
      const section =
        cohort && sectionName
          ? (lk.sections.get(sectionKey(cohort.id, sectionName)) ?? null)
          : null;
      if (cohort && sectionName && !section)
        c.problem('section', `There is no section ${sectionName} for this batch in this term.`);
      if (!sectionName && c.has('subGroup'))
        c.problem('section', 'Enter the section of this sub-group.');
      sectionId = section?.id ?? null;
      const groupName = c.code('subGroup');
      subGroupId = section && groupName ? (section.subGroups.get(groupName) ?? null) : null;
      if (section && groupName && !subGroupId)
        c.problem('subGroup', `Section ${sectionName} has no sub-group ${groupName}.`);
    }
    const step = entityStep(
      ctx,
      lk.org,
      students,
      {
        batchId: batch?.id ?? before?.batchId ?? NEW_ID,
        classRollNo: rollNo,
        universityRollNo: c.text('universityRollNo') ?? before?.universityRollNo ?? null,
        name: c.text('name') ?? before?.name,
        email: c.text('email') ?? before?.email ?? null,
        phone: c.text('phone') ?? before?.phone ?? null,
        sectionId,
        subGroupId,
        status: before?.status ?? 'active',
      },
      found,
      { dept: b?.departmentId ?? null },
      {
        classRollNo: 'classRollNo',
        universityRollNo: 'universityRollNo',
        name: 'name',
        email: 'email',
        phone: 'phone',
        sectionId: 'section',
        subGroupId: 'subGroup',
      },
    );
    return combine(c, [step], async () => {
      const { result, dto } = await step.write();
      if (dto) lk.students.set(rollNo.toUpperCase(), { id: dto.id, input: step.input! });
      return result;
    });
  },
};

// ---- Faculty -------------------------------------------------------------------------------

interface FacultyLk {
  org: Org;
  /** EMPLOYEE CODE → faculty */
  faculty: Map<string, { id: string; name: string; input: z.infer<typeof faculty.schema> }>;
  /** SHORT CODE → employee code using it (existing and earlier rows of this file) */
  shortCodes: Map<string, { employeeCode: string; name: string }>;
}

const facultyKind: KindHandler<FacultyLk> = {
  async load({ tx }) {
    const org = await loadOrg(tx);
    const rows = await tx.faculty.findMany({ where: live, include: facultyInclude });
    return {
      org,
      faculty: new Map(
        rows.map((f) => [
          f.employeeCode.toUpperCase(),
          { id: f.id, name: f.name, input: faculty.toInput(f) },
        ]),
      ),
      shortCodes: new Map(
        rows.map((f) => [
          f.shortCode.toUpperCase(),
          { employeeCode: f.employeeCode.toUpperCase(), name: f.name },
        ]),
      ),
    };
  },
  plan(row, lk, ctx) {
    const c = new Cells(row);
    const employeeCode = c.require('employeeCode', 'Enter the employee code.');
    const key = employeeCode.toUpperCase();
    const found = lk.faculty.get(key) ?? null;
    const before = found?.input ?? null;
    const shortCode = c.code('shortCode') ?? before?.shortCode ?? '';
    const owner = shortCode ? lk.shortCodes.get(shortCode) : undefined;
    if (owner && owner.employeeCode !== key) {
      c.problem(
        'shortCode',
        `${shortCode} is already used by ${owner.name}. Choose another short code.`,
      );
    } else if (shortCode) {
      lk.shortCodes.set(shortCode, {
        employeeCode: key,
        name: c.text('name') ?? found?.name ?? employeeCode,
      });
    }
    const experience = c.choice('experience', EXPERIENCE) ?? before?.experience ?? 'experienced';
    const load = defaultLoad(experience);
    const homeDepartmentId =
      department(c, lk.org, 'department', !before) ?? before?.homeDepartmentId;
    const others = c.has('otherDepartments')
      ? c
          .list('otherDepartments')
          .map((code) => {
            const d = lk.org.departments.get(code.toUpperCase());
            if (!d)
              c.problem(
                'otherDepartments',
                `There is no department with code ${code.toUpperCase()}.`,
              );
            return d?.id;
          })
          .filter((id): id is string => Boolean(id))
      : (before?.departmentIds ?? []);
    const step = entityStep(
      ctx,
      lk.org,
      faculty,
      {
        employeeCode,
        name: c.text('name') ?? before?.name,
        shortCode,
        email: c.text('email') ?? before?.email ?? null,
        designation: c.choice('designation', DESIGNATION) ?? before?.designation,
        experience,
        homeDepartmentId,
        departmentIds: [...new Set(others)].filter((id) => id !== homeDepartmentId).sort(),
        maxPeriodsPerDay:
          c.whole('maxPeriodsPerDay') ?? before?.maxPeriodsPerDay ?? load.maxPeriodsPerDay,
        maxPeriodsPerWeek:
          c.whole('maxPeriodsPerWeek') ?? before?.maxPeriodsPerWeek ?? load.maxPeriodsPerWeek,
      },
      found,
      { dept: homeDepartmentId ?? null, oldDept: before?.homeDepartmentId ?? null },
      {
        employeeCode: 'employeeCode',
        name: 'name',
        shortCode: 'shortCode',
        email: 'email',
        designation: 'designation',
        experience: 'experience',
        homeDepartmentId: 'department',
        departmentIds: 'otherDepartments',
        maxPeriodsPerDay: 'maxPeriodsPerDay',
        maxPeriodsPerWeek: 'maxPeriodsPerWeek',
      },
    );
    return combine(c, [step], async () => {
      const { result, dto } = await step.write();
      if (dto) lk.faculty.set(key, { id: dto.id, name: dto.name, input: step.input! });
      return result;
    });
  },
};

// ---- Rooms ---------------------------------------------------------------------------------

interface RoomsLk {
  org: Org;
  rooms: Map<string, { id: string; input: z.infer<typeof rooms.schema> }>;
  /** building name (lower case) → id */
  buildings: Map<string, string>;
}

const roomsKind: KindHandler<RoomsLk> = {
  async load({ tx }) {
    const org = await loadOrg(tx);
    const roomRows = await tx.room.findMany({ where: live, include: roomInclude });
    const buildingRows = await tx.building.findMany({ where: live });
    return {
      org,
      rooms: new Map(
        roomRows.map((r) => [r.code.toUpperCase(), { id: r.id, input: rooms.toInput(r) }]),
      ),
      buildings: new Map(buildingRows.map((b) => [b.name.toLowerCase(), b.id])),
    };
  },
  plan(row, lk, ctx) {
    const c = new Cells(row);
    const code = c.code('code') ?? '';
    const found = lk.rooms.get(code) ?? null;
    const before = found?.input ?? null;
    const buildingName = c.text('building');
    const buildingId = buildingName
      ? lk.buildings.get(buildingName.toLowerCase())
      : before?.buildingId;
    const newBuilding = buildingName != null && !buildingId;
    if (newBuilding && !allowed(ctx, buildings.manage, buildings.resourceType, null)) {
      c.problems.push(notAllowed(lk.org, null));
    }
    const isShared = c.yesNo('isShared');
    const isAccessible = c.yesNo('isAccessible');
    const raw = (bId: string | undefined): object => ({
      code,
      buildingId: bId,
      floor: c.whole('floor') ?? before?.floor ?? 0,
      type: c.choice('type', ROOM_TYPE) ?? before?.type,
      labCategories: c.has('labCategories')
        ? c.list('labCategories')
        : (before?.labCategories ?? []),
      rows: c.whole('rows') ?? before?.rows ?? null,
      seatsPerRow: c.whole('seatsPerRow') ?? before?.seatsPerRow ?? null,
      capacityOverride: c.whole('capacity') ?? before?.capacityOverride ?? null,
      examSeatsPerBench: c.whole('examSeatsPerBench') ?? before?.examSeatsPerBench ?? null,
      ownerDepartmentId:
        department(c, lk.org, 'ownerDepartment', false) ?? before?.ownerDepartmentId ?? null,
      isShared: isShared ?? before?.isShared ?? true,
      isAccessible: isAccessible ?? before?.isAccessible ?? false,
    });
    const columns = {
      code: 'code',
      buildingId: 'building',
      floor: 'floor',
      type: 'type',
      labCategories: 'labCategories',
      rows: 'rows',
      seatsPerRow: 'seatsPerRow',
      capacityOverride: 'capacity',
      examSeatsPerBench: 'examSeatsPerBench',
      ownerDepartmentId: 'ownerDepartment',
    };
    if (!buildingName && !before) c.problem('building', 'Enter the building or block name.');
    const step = entityStep(
      ctx,
      lk.org,
      rooms,
      raw(buildingId ?? NEW_ID),
      found,
      { dept: null },
      columns,
    );
    return combine(c, [step], async () => {
      let bId = buildingId;
      if (!bId) {
        const b = await ctx.md.createIn(ctx, buildings, {
          name: buildingName!,
          code: null,
          floors: 1,
        });
        bId = b.id;
        lk.buildings.set(buildingName!.toLowerCase(), b.id);
      }
      const again = entityStep(ctx, lk.org, rooms, raw(bId), found, { dept: null }, columns);
      const { result, dto } = await again.write();
      if (dto) lk.rooms.set(code, { id: dto.id, input: again.input! });
      return result;
    });
  },
};

// ---- Courses -------------------------------------------------------------------------------

interface CoursesLk {
  org: Org;
  /** schemeId|CODE → course */
  courses: Map<string, { id: string; input: z.infer<typeof courses.schema> }>;
}

const coursesKind: KindHandler<CoursesLk> = {
  async load({ tx }) {
    const org = await loadOrg(tx);
    const rows = await tx.course.findMany({ where: live, include: courseInclude });
    return {
      org,
      courses: new Map(
        rows.map((r) => [
          `${r.schemeVersionId}|${r.code.toUpperCase()}`,
          { id: r.id, input: courses.toInput(r) },
        ]),
      ),
    };
  },
  plan(row, lk, ctx) {
    const c = new Cells(row);
    const p = programme(c, lk.org);
    const schemeName = c.require('scheme', 'Enter the scheme name, e.g. Scheme 2024.');
    const schemeId = p ? (p.schemes.get(schemeName.toLowerCase()) ?? null) : null;
    const code = c.code('code') ?? '';
    const found = schemeId ? (lk.courses.get(`${schemeId}|${code}`) ?? null) : null;
    const before = found?.input ?? null;
    const branchIds = c.has('branches')
      ? c
          .list('branches')
          .map((bc) => {
            const b = p?.branches.get(bc.toUpperCase());
            if (p && !b) c.problem('branches', `${p.code} has no branch ${bc.toUpperCase()}.`);
            return b?.id;
          })
          .filter((id): id is string => Boolean(id))
          .sort()
      : (before?.branchIds ?? []);
    const offeringDepartmentId =
      department(c, lk.org, 'department', !before) ?? before?.offeringDepartmentId;
    const raw = (sId: string): object => ({
      schemeVersionId: sId,
      semester: c.whole('semester') ?? before?.semester,
      code,
      title: c.text('title') ?? before?.title,
      shortName: c.text('shortName') ?? before?.shortName,
      lectures: c.whole('lectures') ?? before?.lectures ?? 0,
      tutorials: c.whole('tutorials') ?? before?.tutorials ?? 0,
      practicals: c.whole('practicals') ?? before?.practicals ?? 0,
      creditsOverride: c.decimal('credits') ?? before?.creditsOverride ?? null,
      syllabusHours: c.whole('syllabusHours') ?? before?.syllabusHours ?? null,
      type: c.choice('type', COURSE_TYPE) ?? before?.type ?? 'core',
      electiveGroup: c.text('electiveGroup') ?? before?.electiveGroup ?? null,
      offeringDepartmentId,
      roomType: before?.roomType ?? null,
      labCategory: c.text('labCategory') ?? before?.labCategory ?? null,
      labBlockLength: c.whole('labBlockLength') ?? before?.labBlockLength ?? 2,
      isScheduled: before?.isScheduled ?? true,
      tutorialBy: before?.tutorialBy ?? 'subgroup',
      practicalBy: before?.practicalBy ?? 'subgroup',
      branchIds,
    });
    const semester = c.whole('semester');
    if (p && semester != null && semester > p.totalSemesters) {
      c.problem('semester', `${p.code} has ${p.totalSemesters} semesters.`);
    }
    const columns = {
      semester: 'semester',
      code: 'code',
      title: 'title',
      shortName: 'shortName',
      lectures: 'lectures',
      tutorials: 'tutorials',
      practicals: 'practicals',
      creditsOverride: 'credits',
      syllabusHours: 'syllabusHours',
      type: 'type',
      electiveGroup: 'electiveGroup',
      offeringDepartmentId: 'department',
      labCategory: 'labCategory',
      labBlockLength: 'labBlockLength',
      branchIds: 'branches',
    };
    // A course belongs to its branches' department, else its programme's (ADR 0008).
    const branchDepts = new Set(
      branchIds.map(
        (id) => [...(p?.branches.values() ?? [])].find((b) => b.id === id)!.departmentId,
      ),
    );
    const dept =
      branchDepts.size === 1
        ? [...branchDepts][0]!
        : branchIds.length > 0
          ? null
          : (p?.departmentId ?? null);
    if (
      p &&
      !schemeId &&
      !allowed(ctx, schemeVersions.manage, schemeVersions.resourceType, p.departmentId)
    ) {
      c.problems.push(notAllowed(lk.org, p.departmentId));
    }
    const step = entityStep(
      ctx,
      lk.org,
      courses,
      raw(schemeId ?? NEW_ID),
      found,
      { dept },
      columns,
    );
    return combine(c, [step], async () => {
      let sId = schemeId;
      if (!sId) {
        const s = await ctx.md.createIn(ctx, schemeVersions, {
          programmeId: p!.id,
          name: schemeName,
          status: 'draft',
        });
        sId = s.id;
        p!.schemes.set(schemeName.toLowerCase(), s.id);
      }
      const again = entityStep(ctx, lk.org, courses, raw(sId), found, { dept }, columns);
      const { result, dto } = await again.write();
      if (dto) lk.courses.set(`${sId}|${code}`, { id: dto.id, input: again.input! });
      return result;
    });
  },
};

// ---- Holidays ------------------------------------------------------------------------------

interface HolidaysLk {
  org: Org;
  /** yyyy-mm-dd|name (lower case) → holiday */
  holidays: Map<string, { id: string; input: z.infer<typeof holidays.schema> }>;
}

const holidaysKind: KindHandler<HolidaysLk> = {
  async load({ tx }) {
    const org = await loadOrg(tx);
    const rows = await tx.holiday.findMany({ where: live });
    const map = new Map<string, { id: string; input: z.infer<typeof holidays.schema> }>();
    for (const h of rows) {
      const input = holidays.toInput(h);
      map.set(`${input.startDate}|${input.name.toLowerCase()}`, { id: h.id, input });
    }
    return { org, holidays: map };
  },
  plan(row, lk, ctx) {
    const c = new Cells(row);
    const startDate = c.date('startDate');
    if (startDate == null && !c.has('startDate'))
      c.problem('startDate', 'Enter the date, e.g. 20-10-2026.');
    const name = c.require('name', 'Enter the holiday name.');
    const key = `${startDate}|${name.toLowerCase()}`;
    const found = lk.holidays.get(key) ?? null;
    const departmentId = department(c, lk.org, 'department', false);
    const step = entityStep(
      ctx,
      lk.org,
      holidays,
      {
        name,
        startDate,
        endDate: c.date('endDate') ?? startDate,
        scopeType: departmentId ? 'department' : 'institute',
        departmentId,
      },
      found,
      { dept: null },
      { name: 'name', startDate: 'startDate', endDate: 'endDate', departmentId: 'department' },
    );
    return combine(c, [step], async () => {
      const { result, dto } = await step.write();
      if (dto) lk.holidays.set(key, { id: dto.id, input: step.input! });
      return result;
    });
  },
};

// ---- Teaching assignments ------------------------------------------------------------------

interface TeachingLk extends Groups {
  /** CLASS CODE → cohort */
  cohortsByCode: Map<string, CohortLk>;
  /** schemeId|CODE → course */
  courses: Map<
    string,
    { id: string; code: string; lectures: number; tutorials: number; practicals: number }
  >;
  /** SHORT CODE or EMPLOYEE CODE → faculty */
  faculty: Map<string, { id: string; homeDepartmentId: string }>;
  /** termId|courseId|component|targetId → assignment and its faculty */
  assignments: Map<string, { id: string; main: string[]; co: string[] }>;
}

const PERIODS: Record<Component, 'lectures' | 'tutorials' | 'practicals'> = {
  lecture: 'lectures',
  tutorial: 'tutorials',
  practical: 'practicals',
};

const teachingKind: KindHandler<TeachingLk> = {
  async load(ctx) {
    const groups = await loadGroups(ctx);
    const { tx } = ctx;
    const courseRows = await tx.course.findMany({
      where: live,
      select: {
        id: true,
        code: true,
        schemeVersionId: true,
        lectures: true,
        tutorials: true,
        practicals: true,
      },
    });
    const facultyRows = await tx.faculty.findMany({
      where: live,
      select: { id: true, shortCode: true, employeeCode: true, homeDepartmentId: true },
    });
    const assignmentRows = groups.term
      ? await tx.teachingAssignment.findMany({
          where: { termId: groups.term.id, ...live },
          include: { faculty: true },
        })
      : [];
    const facultyMap = new Map<string, { id: string; homeDepartmentId: string }>();
    for (const f of facultyRows) {
      facultyMap.set(f.employeeCode.toUpperCase(), f);
      facultyMap.set(f.shortCode.toUpperCase(), f);
    }
    return {
      ...groups,
      cohortsByCode: new Map(
        [...groups.cohorts.values()].map((co) => [co.displayCode.toUpperCase(), co]),
      ),
      courses: new Map(courseRows.map((r) => [`${r.schemeVersionId}|${r.code.toUpperCase()}`, r])),
      faculty: facultyMap,
      assignments: new Map(
        assignmentRows.map((a) => [
          `${a.courseId}|${a.component}|${a.subGroupId ?? a.sectionId}`,
          {
            id: a.id,
            main: a.faculty
              .filter((f) => f.role === 'main')
              .map((f) => f.facultyId)
              .sort(),
            co: a.faculty
              .filter((f) => f.role !== 'main')
              .map((f) => f.facultyId)
              .sort(),
          },
        ]),
      ),
    };
  },
  plan(row, lk, ctx) {
    const c = new Cells(row);
    if (!lk.term) c.problem(null, 'Choose the term these assignments are for.');
    const classCode = c.require('class', 'Enter the class code, e.g. CSE S3.').toUpperCase();
    const cohort = classCode ? (lk.cohortsByCode.get(classCode) ?? null) : null;
    if (classCode && lk.term && !cohort) {
      c.problem(
        'class',
        `There is no class ${classCode} in this term. See the Cohorts page for the codes.`,
      );
    }
    // Lateral-entry classes sit in the regular class's sections.
    const sectionCohortId = cohort?.joinsCohortId ?? cohort?.id ?? null;
    const sectionName = c.require('section', 'Enter the section, e.g. A.').toUpperCase();
    const section =
      sectionCohortId && sectionName
        ? (lk.sections.get(sectionKey(sectionCohortId, sectionName)) ?? null)
        : null;
    if (cohort && sectionName && !section)
      c.problem('section', `${cohort.displayCode} has no section ${sectionName}.`);
    const groupName = c.code('subGroup');
    const subGroupId = section && groupName ? (section.subGroups.get(groupName) ?? null) : null;
    if (section && groupName && !subGroupId)
      c.problem('subGroup', `Section ${sectionName} has no sub-group ${groupName}.`);

    const courseCode = c.require('course', 'Enter the course code, e.g. CS301.').toUpperCase();
    const course =
      cohort && courseCode
        ? (lk.courses.get(`${cohort.schemeVersionId}|${courseCode}`) ?? null)
        : null;
    if (cohort && courseCode && !course)
      c.problem('course', `${courseCode} is not in ${cohort.displayCode}’s scheme.`);
    const component = c.choice('component', COMPONENT);
    if (!component && !c.has('component')) c.problem('component', 'Enter L, T or P.');
    if (course && component && course[PERIODS[component]] === 0) {
      c.problem(
        'component',
        `${course.code} has no ${component} periods (${COMPONENT_LETTER[component]} = 0).`,
      );
    }

    const teacher = (code: string, col: string) => {
      const f = lk.faculty.get(code.toUpperCase());
      if (!f)
        c.problem(
          col,
          `There is no teacher with code ${code.toUpperCase()}. Import faculty first.`,
        );
      return f;
    };
    const mainCode = c.require('teacher', 'Enter the teacher’s short code.');
    const main = mainCode ? teacher(mainCode, 'teacher') : undefined;
    const co = c
      .list('coTeachers')
      .map((code) => teacher(code, 'coTeachers'))
      .filter((f) => f != null);
    const mainIds = main ? [main.id] : [];
    const coIds = [...new Set(co.map((f) => f.id))].filter((id) => !mainIds.includes(id)).sort();

    const targetId = subGroupId ?? section?.id ?? null;
    const key = course && component && targetId ? `${course.id}|${component}|${targetId}` : null;
    const found = key ? (lk.assignments.get(key) ?? null) : null;
    const action: Plan['action'] = !found
      ? 'create'
      : stable(found.main) === stable(mainIds) && stable(found.co) === stable(coIds)
        ? 'unchanged'
        : 'update';
    const facultyDepartmentIds = [main, ...co]
      .filter((f) => f != null)
      .map((f) => f.homeDepartmentId);
    if (
      action !== 'unchanged' &&
      cohort &&
      !allowed(ctx, 'teaching.manage', 'teaching_assignment', cohort.departmentId, {
        facultyDepartmentIds,
      })
    ) {
      c.problems.push(notAllowed(lk.org, cohort.departmentId));
    }

    return {
      problems: c.problems,
      action,
      async write() {
        if (action === 'unchanged') return 'unchanged';
        const { tx, tenant } = ctx;
        const instituteId = tenant.institute.id;
        ctx.md.assertCan(
          tenant,
          'teaching.manage',
          ctx.md.resource(tenant, 'teaching_assignment', cohort!.departmentId, {
            facultyDepartmentIds,
          }),
        );
        let id = found?.id;
        if (!id) {
          const created = await tx.teachingAssignment.create({
            data: {
              instituteId,
              termId: lk.term!.id,
              courseId: course!.id,
              component: component!,
              target: subGroupId ? 'subgroup' : 'section',
              sectionId: subGroupId ? null : section!.id,
              subGroupId,
            },
          });
          id = created.id;
        } else {
          await tx.teachingAssignmentFaculty.deleteMany({ where: { assignmentId: id } });
        }
        await tx.teachingAssignmentFaculty.createMany({
          data: [
            ...mainIds.map((facultyId) => ({
              instituteId,
              assignmentId: id!,
              facultyId,
              role: 'main' as const,
            })),
            ...coIds.map((facultyId) => ({
              instituteId,
              assignmentId: id!,
              facultyId,
              role: 'co_teacher' as const,
            })),
          ],
        });
        const after = { main: mainIds, co: coIds };
        await ctx.md.audit(
          ctx,
          found ? 'teaching_assignment.updated' : 'teaching_assignment.created',
          'teaching_assignment',
          id,
          found
            ? { changes: { faculty: { from: { main: found.main, co: found.co }, to: after } } }
            : {
                after: {
                  courseId: course!.id,
                  component: component!,
                  targetId: targetId!,
                  ...after,
                },
              },
        );
        lk.assignments.set(key!, { id, ...after });
        return found ? 'updated' : 'created';
      },
    };
  },
};

export const KIND_HANDLERS: Readonly<Record<ImportKindName, KindHandler>> = {
  departments: departmentsKind,
  programmes: programmesKind,
  batches_sections: batchesSectionsKind,
  students: studentsKind,
  faculty: facultyKind,
  rooms: roomsKind,
  courses: coursesKind,
  holidays: holidaysKind,
  teaching_assignments: teachingKind,
};
